// adminService.test.ts — the two roll-up loaders behind the new admin
// hierarchy (2026-11-18).
//
// The Projects tab's Pricing section shows the whole table at once
// (listAdminProjectPricing), and Users → Project profiles shows every saved
// car profile across builders (listAdminCarProfiles). Neither had a test, and
// both do something a screen cannot check: key rows by id, join owner names
// through a second table, and degrade to a fallback instead of throwing.
//
// The Supabase client is faked rather than mocked per-query: the point is the
// query SHAPE (which table, in which order, awaited at which step) plus the
// mapping, so the fake records every call.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const responses = new Map<string, { data: unknown; error: unknown }>();

  const from = (table: string) => {
    const record = (method: string, args: unknown[]) => {
      calls.push({ table, method, args });
    };
    const result = () => responses.get(table) ?? { data: null, error: null };
    const builder = {
      select: (...args: unknown[]) => {
        record("select", args);
        return builder;
      },
      order: (...args: unknown[]) => {
        record("order", args);
        return Promise.resolve(result());
      },
      in: (...args: unknown[]) => {
        record("in", args);
        return Promise.resolve(result());
      },
      // `select()` is awaited directly by listAdminProjectPricing, so the
      // builder is thenable and resolves its table's response.
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  };

  return {
    calls,
    responses,
    supabase: { from },
    reset() {
      calls.length = 0;
      responses.clear();
    },
    respond(table: string, data: unknown, error: unknown = null) {
      responses.set(table, { data, error });
    },
  };
});

vi.mock("../config/supabase", () => ({ supabase: fake.supabase }));

import { listAdminCarProfiles, listAdminProjectPricing } from "./adminService";

beforeEach(() => {
  fake.reset();
});

describe("listAdminProjectPricing", () => {
  it("reads the whole project_pricing table and keys the rows by project id", async () => {
    fake.respond("project_pricing", [
      {
        id: "prj-4wd",
        package_base_charge: 2500,
        component_markup_percent: 15,
        minimum_order: 1,
        price_status: "approved",
        price_approved_at: "2026-11-18T10:00:00.000Z",
        price_approved_by: "owner-1",
        note: "classroom kit",
        updated_at: "2026-11-18T10:00:00.000Z",
      },
      {
        id: "prj-dustbin",
        package_base_charge: 1800,
        component_markup_percent: 0,
        minimum_order: 2,
        // Anything but "approved" is a draft — staff must see it as unpublished,
        // whatever the column actually says.
        price_status: "pending",
        note: "",
        updated_at: "2026-11-17T09:00:00.000Z",
      },
    ]);

    const rows = await listAdminProjectPricing();

    expect(Object.keys(rows).sort()).toEqual(["prj-4wd", "prj-dustbin"]);
    expect(rows["prj-4wd"]).toMatchObject({
      id: "prj-4wd",
      packageBaseCharge: 2500,
      componentMarkupPercent: 15,
      priceStatus: "approved",
      priceApprovedBy: "owner-1",
    });
    expect(rows["prj-dustbin"].priceStatus).toBe("draft");
    expect(rows["prj-dustbin"].priceApprovedAt).toBeNull();

    // One round trip: select every row, no per-project query.
    expect(fake.calls).toEqual([
      { table: "project_pricing", method: "select", args: ["*"] },
    ]);
  });

  it("returns an empty record when the table has no rows", async () => {
    fake.respond("project_pricing", []);
    await expect(listAdminProjectPricing()).resolves.toEqual({});
  });

  it("throws the database error instead of showing an empty pricing section", async () => {
    fake.respond("project_pricing", null, { message: "permission denied" });
    await expect(listAdminProjectPricing()).rejects.toEqual({
      message: "permission denied",
    });
  });
});

const CAR_ROWS = [
  {
    id: "cp-1",
    user_id: "user-1",
    profile_key: "classroom-a",
    car_name: "Obstacle car",
    unique_id: "AA:BB",
    settings: { speed: 3 },
    updated_at: "2026-11-18T11:00:00.000Z",
  },
  {
    id: "cp-2",
    user_id: "user-2",
    profile_key: "line-follow",
    car_name: "Line follower",
    unique_id: "",
    settings: null,
    updated_at: "2026-11-18T10:00:00.000Z",
  },
  {
    // A second profile by the same builder: the owner join must not repeat the
    // id, and the row must still resolve to that one owner.
    id: "cp-3",
    user_id: "user-1",
    profile_key: "classroom-b",
    car_name: "Obstacle car (copy)",
    unique_id: "CC:DD",
    settings: {},
    updated_at: "2026-11-17T08:00:00.000Z",
  },
];

describe("listAdminCarProfiles", () => {
  it("lists every profile newest first and attaches the owner's name and email", async () => {
    fake.respond("car_profiles", CAR_ROWS);
    fake.respond("profiles", [
      {
        id: "user-1",
        name: "Ananya Subramanian",
        email: "ananya@example.test",
      },
      { id: "user-2", name: "Rahul Menon", email: "rahul@example.test" },
    ]);

    const rows = await listAdminCarProfiles();

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: "cp-1",
      userId: "user-1",
      ownerName: "Ananya Subramanian",
      ownerEmail: "ananya@example.test",
      profileKey: "classroom-a",
      carName: "Obstacle car",
      settings: { speed: 3 },
    });
    // A profile saved without settings must come back as an object, never null.
    expect(rows[1].settings).toEqual({});
    expect(rows[2].ownerName).toBe("Ananya Subramanian");

    expect(fake.calls).toEqual([
      {
        table: "car_profiles",
        method: "select",
        args: [
          "id, user_id, profile_key, car_name, unique_id, settings, updated_at",
        ],
      },
      {
        table: "car_profiles",
        method: "order",
        args: ["updated_at", { ascending: false }],
      },
      // Deduped: two profiles, two distinct builders, one id each — and the
      // order follows first appearance.
      { table: "profiles", method: "select", args: ["id, name, email"] },
      { table: "profiles", method: "in", args: ["id", ["user-1", "user-2"]] },
    ]);
  });

  it("falls back to the user id when the owner has no profile row", async () => {
    fake.respond("car_profiles", [CAR_ROWS[1]]);
    fake.respond("profiles", []);

    const [row] = await listAdminCarProfiles();
    expect(row.ownerName).toBe("");
    expect(row.ownerEmail).toBe("user-2");
  });

  it("skips the owner join entirely when no profiles are saved", async () => {
    fake.respond("car_profiles", []);

    await expect(listAdminCarProfiles()).resolves.toEqual([]);
    expect(fake.calls.some((call) => call.table === "profiles")).toBe(false);
  });

  it("throws when the profile list cannot be read", async () => {
    fake.respond("car_profiles", null, { message: "RLS denied" });
    await expect(listAdminCarProfiles()).rejects.toEqual({
      message: "RLS denied",
    });
  });
});
