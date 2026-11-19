// =====================================================================
// Phase 6/7 (owner 2026-11-19) — the admin Users tab, pinned.
//
// Owner report: "the user tab of the admin dashboard is quite confusing and
// duplicating the things", "each car should be treated as a unique device",
// "the user preference should display only its user log about the different
// car properly", "have the tabs of subtabs for the user to see and use things
// properly".
//
// The behaviour itself is tested directly (deviceIdentity.test.ts pins the
// grouping rules). What this file pins is the WIRING in the 7k-line admin
// screen: a future refactor could keep the pure helper green while the screen
// quietly went back to one row per profile key, or back to a single stacked
// panel with no per-account activity window.
//
// Same F-83 convention as remoteChrome.test.ts: raw TSX with comments
// stripped, because this repo has no React Testing Library.
// =====================================================================

import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { readSource } from "../../test-utils/readSource";

function raw(rel: string): string {
  return readSource(fileURLToPath(new NodeURL(rel, import.meta.url)));
}

function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const admin = strip(raw("./AdminScreen.tsx"));
const service = strip(raw("../services/adminService.ts"));

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("Phase 6 — one entry per physical car in the admin Users tab", () => {
  it("has a source to check (the rules must not pass vacuously)", () => {
    expect(admin.length).toBeGreaterThan(50_000);
    expect(admin).toContain("function UsersSection({");
    expect(admin).toContain("function ProjectProfilesTab()");
  });

  it("imports the ONE grouping helper instead of re-deriving identity", () => {
    expect(admin).toContain(
      'import { groupProfilesByDevice } from "../services/deviceIdentity";',
    );
  });

  it("the fleet window lists DEVICES, keyed by the device identity", () => {
    // Both windows call the helper; two call sites = fleet + per-account.
    expect(count(admin, "groupProfilesByDevice(")).toBeGreaterThanOrEqual(2);
    // The rendered row is the device, not the profile row.
    expect(admin).toContain("shown.map((device) => (");
    expect(admin).toContain("key={device.deviceKey}");
    expect(admin).toContain("device.project ??");
    expect(admin).toContain("device.profileKeys.join(");
    // …and the old per-profile row key is gone from that list.
    expect(admin).not.toContain("key={profile.id}");
  });

  it("an account's car list is ordered by device too", () => {
    expect(admin).toContain("const groups = groupProfilesByDevice(rows);");
    expect(admin).toContain(
      "const orderedRows = groups.flatMap((group) => group.rows);",
    );
    expect(admin).toContain("orderedRows.map((row) => (");
    // The car's canonical project id is shown on every saved row.
    expect(admin).toContain('row.settings?.project_id ?? "project unknown"');
  });

  it("the fleet window reports devices AND profile rows (no false total)", () => {
    expect(admin).toContain("{devices.length} device");
    expect(admin).toContain("{profiles.length} profile row");
  });
});

describe("Phase 7 — an account's detail is three windows, not one stack", () => {
  it("the nested strip names the three concerns", () => {
    expect(admin).toContain(
      'const USER_DETAIL_TABS = ["Cars", "Preferences", "Activity"] as const;',
    );
    expect(admin).toContain("function UserDetailPanel({");
    expect(admin).toContain('label="Account detail sections"');
  });

  it("each window mounts only its own manager", () => {
    expect(admin).toContain('{tab === "Cars" ? (');
    expect(admin).toContain('{tab === "Preferences" ? (');
    expect(admin).toContain('{tab === "Activity" ? (');
    // The old stacked pair inside the expanded row is gone.
    expect(admin).not.toContain(
      "<UserProjectProfileManager\n                  userId={item.id}\n                  email={item.email}\n                  canDelete={canDelete}\n                />\n                <UserRobotSettingsManager",
    );
  });

  it("Activity is the account's OWN log, not the fleet stream", () => {
    expect(admin).toContain("function UserActivityPanel({");
    expect(admin).toContain(
      "const result = await listUserActivityLogsFor(userId, nextPage);",
    );
    // A fleet-wide call inside the per-user panel would be the bug back.
    const panelAt = admin.indexOf("function UserActivityPanel({");
    const panel = admin.slice(panelAt, panelAt + 4000);
    expect(panel).not.toContain("listUserActivityLogs(");
    // The service performs the narrowing server-side.
    expect(service).toContain("export async function listUserActivityLogsFor(");
    expect(service).toContain('.eq("user_id", userId)');
  });
});
