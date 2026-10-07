// =====================================================================
// deviceRegistryService.userDevices tests — the two garage ACTIONS that
// are not renames: the favourite flag and the row-level delete.
//
// Both existed as dead ends before U-95 Phase 4a:
//   • `is_favourite` was SELECTed into UserDevice and read nowhere else —
//     a column nobody could ever set;
//   • the garage card could rename a row but never unlink one, so "my
//     garage" only ever grew.
//
// The assertions below pin the SHAPE of each write, because the failure
// modes here are silent-wipe failures, not crashes:
//   • an upsert payload that carries `display_name` (even as "") overwrites
//     the name the owner gave the car — the F-44 narrow-patch class;
//   • a delete keyed on user_id alone would unlink EVERY unit in the
//     owner's garage while appearing to remove one row.
// =====================================================================
import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state = {
    fromTables: [] as string[],
    upsertPayloads: [] as Record<string, unknown>[],
    upsertOpts: [] as { onConflict?: string }[],
    deleteEq: [] as [string, unknown][],
    upsertError: null as { message: string } | null,
    deleteError: null as { message: string } | null,
    reject: false,
  };
  const from = vi.fn((table: string) => {
    state.fromTables.push(table);
    if (state.reject) throw new Error("offline");
    return {
      upsert: async (
        payload: Record<string, unknown>,
        opts: { onConflict?: string },
      ) => {
        state.upsertPayloads.push(payload);
        state.upsertOpts.push(opts);
        return { error: state.upsertError };
      },
      delete: () => ({
        eq: (col: string, val: unknown) => {
          state.deleteEq.push([col, val]);
          return {
            eq: (col2: string, val2: unknown) => {
              state.deleteEq.push([col2, val2]);
              return Promise.resolve({ error: state.deleteError });
            },
          };
        },
      }),
    };
  });
  return { state, from };
});

vi.mock("../config/supabase", () => ({
  supabase: { from: (...a: unknown[]) => dbMocks.from(...(a as [string])) },
  supabaseConfigured: true,
  googleWebClientId: "",
  googleConfigured: false,
}));

const { setDeviceFavourite, removeUserDevice } =
  await import("./deviceRegistryService");

function reset() {
  dbMocks.state.fromTables = [];
  dbMocks.state.upsertPayloads = [];
  dbMocks.state.upsertOpts = [];
  dbMocks.state.deleteEq = [];
  dbMocks.state.upsertError = null;
  dbMocks.state.deleteError = null;
  dbMocks.state.reject = false;
  dbMocks.from.mockClear();
}

describe("setDeviceFavourite (the dead column becomes writable)", () => {
  it("upserts the flag on user_devices keyed by user+device", async () => {
    reset();
    expect(await setDeviceFavourite("user-1", "dev-9", true)).toBe(true);
    expect(dbMocks.state.fromTables).toEqual(["user_devices"]);
    expect(dbMocks.state.upsertPayloads[0]).toEqual({
      user_id: "user-1",
      device_id: "dev-9",
      is_favourite: true,
    });
    expect(dbMocks.state.upsertOpts[0]).toEqual({
      onConflict: "user_id,device_id",
    });
  });

  it("never sends display_name — a bare upsert must not wipe the owner's name", async () => {
    reset();
    await setDeviceFavourite("user-1", "dev-9", false);
    expect(Object.keys(dbMocks.state.upsertPayloads[0]!).sort()).toEqual([
      "device_id",
      "is_favourite",
      "user_id",
    ]);
    expect(dbMocks.state.upsertPayloads[0]!.is_favourite).toBe(false);
  });

  it("reports failure when the write is rejected or offline", async () => {
    reset();
    dbMocks.state.upsertError = { message: "42501" };
    expect(await setDeviceFavourite("user-1", "dev-9", true)).toBe(false);
    reset();
    dbMocks.state.reject = true;
    expect(await setDeviceFavourite("user-1", "dev-9", true)).toBe(false);
  });
});

describe("removeUserDevice (row-level delete)", () => {
  it("deletes exactly one row: BOTH filters are present", async () => {
    reset();
    expect(await removeUserDevice("user-1", "dev-9")).toBe(true);
    expect(dbMocks.state.fromTables).toEqual(["user_devices"]);
    expect(dbMocks.state.deleteEq).toEqual([
      ["user_id", "user-1"],
      ["device_id", "dev-9"],
    ]);
  });

  it("reports failure when the delete is rejected or offline", async () => {
    reset();
    dbMocks.state.deleteError = { message: "42501" };
    expect(await removeUserDevice("user-1", "dev-9")).toBe(false);
    reset();
    dbMocks.state.reject = true;
    expect(await removeUserDevice("user-1", "dev-9")).toBe(false);
  });
});
