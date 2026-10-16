// =====================================================================
// P7 / issue 8 (2026-10-16) — every setting stores in the car AND in the
// app promptly and stays in sync.
//
// The car's half was already whole (the `settings-round-trip` contract rule
// in Genum_4WD4M_CAR pins it: each WIFICFG toggle persists to NVS before it
// is acked and is reported on both the STATE line and the /status JSON). The
// gaps were all app-side, and each one had the same shape: the app ADOPTED
// car truth into live state but never wrote it into the per-car profile, so
// the next restart resurrected whatever disk last held:
//
//   1. mode adopted from a STATE echo (the car's own mode button) — live
//      only, while selectMode() persists its pick;
//   2. speed adopted from a confirmed echo — live only;
//   3. the saved-router registry adopted from `networks`/`NETW` (changed on
//      another surface) — live only;
//   4. the D-pad/Joystick pill and the "auto-join saved router" switch were
//      RAW useState setters — never persisted at all;
//   5. the WIFICFG REPLY handler adopted `WIFICFG;WIFI|BT|AUTOJOIN;ON|OFF`
//      WITHOUT the optimistic-commit grace, so a reply in flight during a
//      user flip rolled the panel back AND persisted the pre-flip value;
//   6. nothing re-read the car when the app returned to the foreground — the
//      toggles were queried only on the link-up transition.
//
// WHY THIS READS SOURCE (F-83): there is no component test harness in this
// repo (no React Testing Library — see the same note in
// ../oneActiveLink.test.ts), so a rendered assertion is not available. Each
// rule below was proven in BOTH directions (mutate → red, restore → green)
// when it was written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

const RAW = readFileSync(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
  "utf8",
);

/** Comments stripped, string literals KEPT. The line-comment regex spares a
    `//` that is preceded by `:` so URL literals (ws://, https://) survive —
    the sanity test below asserts the load-bearing literals did. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
  .join("\n");

/** Every index at which `needle` occurs in `code`. */
function all(needle: string): number[] {
  const out: number[] = [];
  let at = code.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = code.indexOf(needle, at + needle.length);
  }
  return out;
}

/** A slice of `code` starting at `from`, bounded by `span` characters — used
    where a branch is what the rule is about and pulling the whole file would
    drag in the unrelated code beside it. */
function slice(from: number, span: number): string {
  return code.slice(from, from + span);
}

describe("P7 — issue 8: settings store promptly and stay in sync", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW.length).toBeGreaterThan(10000);
    expect(code).toContain("const applyTelemetry = (t: CarTelemetry) => {");
    expect(code).toContain('reply.startsWith("WIFICFG;WIFI;")');
    expect(code).toContain('reply.startsWith("WIFICFG;BT;")');
    expect(code).toContain('reply.startsWith("WIFICFG;AUTOJOIN;")');
    expect(code).toContain("const persistPrefs = React.useCallback(");
    // the URL-mangling sanity check: a `ws://` literal must survive the strip
    expect(code).toContain('startsWith("ws://")');
  });

  it("an ADOPTED mode (the car's own button) reaches the per-car profile", () => {
    // selectMode() persists `{ modeId: m.id }` for a USER pick; the telemetry
    // adopt block must do the same for CAR truth, or the app resurrected the
    // previous mode after a restart. Stored as the local CarMode id — the
    // shape DeviceProfileCard restores by — never the raw car token.
    const at = code.indexOf("if (t.mode) {");
    expect(at).toBeGreaterThan(0);
    const guardAt = code.indexOf(
      "const modeChanged = carModeIdRef.current !== canonical;",
    );
    expect(guardAt).toBeGreaterThan(at);
    const block = slice(guardAt, 700);
    // guard and write are ONE statement: the steady 1 Hz echo schedules
    // nothing, only a real mode change does
    expect(block).toContain(
      "if (modeChanged)\n            persistPrefsRef.current?.({\n              modeId: matched ? matched.id : canonical.toLowerCase(),\n            });",
    );
  });

  it("an ADOPTED speed reaches the per-car profile", () => {
    // The car confirming a speed (its own command, a mode change, another
    // phone) updated live state only — the profile kept the stale number and
    // the app resurrected it on the next start.
    const at = code.indexOf("if (!navActiveRef.current && t.speed != null)");
    expect(at).toBeGreaterThan(0);
    const block = slice(at, 800);
    expect(block).toContain("persistPrefsRef.current?.({ speed: next });");
    // inside the change guard: `next !== speedRef.current`
    expect(block).toContain("if (next !== speedRef.current) {");
  });

  it("an ADOPTED saved-router registry reaches the per-car profile", () => {
    // The registry is edited on other surfaces (a second phone, ROUTERS;ADD
    // / DEL answers). The adopt block feeds live state; the profile must
    // follow, change-guarded on the same mirror, or a restart resurrects the
    // stale list from disk.
    const at = code.indexOf("const incomingRouters =");
    expect(at).toBeGreaterThan(0);
    const block = slice(at, 1000);
    expect(block).toContain("const prevRouters = savedNetworksRef.current;");
    expect(block).toContain(
      "persistPrefsRef.current?.({ savedRouters: incoming.slice() });",
    );
    expect(block).toContain("if (!unchanged)");
    expect(block).toContain("setCarNetworks((prev) =>");
  });

  it("WIFICFG replies run the same optimistic-commit grace as broadcasts", () => {
    // The defect this rule exists for: the reply handler adopted its value
    // unconditionally. A query answer (WIFICFG;X;?) or set echo in flight
    // during a user flip carries the PRE-flip state — adopting it rolled the
    // panel back and PERSISTED the pre-flip value. Every branch must consult
    // the shared predicate, change-guard on the live mirror, and update the
    // mirror so the next frame's guard sees the adopted value.
    const branches: [string, string][] = [
      ["wifiEnabled", 'reply.startsWith("WIFICFG;WIFI;")'],
      ["btEnabled", 'reply.startsWith("WIFICFG;BT;")'],
      ["bootAutojoin", 'reply.startsWith("WIFICFG;AUTOJOIN;")'],
    ];
    for (const [key, anchor] of branches) {
      const hits = all(anchor);
      expect(hits.length).toBe(1);
      const block = slice(hits[0], 900);
      expect(block).toContain(`toggleChangeProtectedRef.current("${key}", on)`);
      expect(block).toContain(`transportToggleRef.current.${key} !== on`);
      expect(block).toContain(
        `transportToggleRef.current = {\n            ...transportToggleRef.current,\n            ${key}: on,\n          };`,
      );
      expect(block).toContain(`persistPrefs({ ${key}: on });`);
    }
  });

  it("the grace is ONE named rule every adoption path runs", () => {
    // Defined once (expiry + pending check), read through a ref mirror so no
    // effect depends on its identity; the broadcast path must call it rather
    // than carry its own inline copy that can drift.
    const defAt = code.indexOf("const toggleChangeProtected = (");
    expect(defAt).toBeGreaterThan(0);
    const defBlock = slice(defAt, 500);
    expect(defBlock).toContain(
      "Date.now() - commit.at > TOGGLE_CHANGE_GRACE_MS",
    );
    expect(defBlock).toContain(
      "return !(pending?.which === which && pending.value !== incoming);",
    );

    const adoptAt = code.indexOf(
      "const protect = toggleChangeProtectedRef.current;",
    );
    expect(adoptAt).toBeGreaterThan(defAt);
    // the old inline closure is gone, not merely bypassed
    expect(code).not.toContain(
      ") => !(pending?.which === which && pending.value !== incoming);",
    );
  });

  it("the D-pad/Joystick pill persists through the guarded writer", () => {
    // It used to be a raw useState setter returned as-is — a preference that
    // died with the app session. The public setter is now the wrapper; the
    // RESTORE paths keep the raw setter on purpose (loading a profile is not
    // a user edit and must not write back).
    const at = code.indexOf("const setUseJoystick = (value: boolean) => {");
    expect(at).toBeGreaterThan(0);
    const block = slice(at, 220);
    expect(block).toContain("setUseJoystickState(value);");
    expect(block).toContain(
      "persistPrefsRef.current?.({ useJoystick: value });",
    );

    // the raw state setter exists and is what the restore paths use
    expect(code).toContain(
      "const [useJoystick, setUseJoystickState] = useState(false);",
    );
    const restore = code.indexOf("setUseJoystickState(resolved.useJoystick);");
    expect(restore).toBeGreaterThan(0);

    // and the wrapper — not the raw setter — is what the hook returns
    const retAt = code.indexOf("    setUseJoystick,");
    expect(retAt).toBeGreaterThan(at);
  });

  it("the auto-join-router switch persists through the guarded writer", () => {
    // Same shape: CarProfileCard and the Remote screen both flip this, and
    // both got the persisting wrapper for free by keeping the public name.
    const at = code.indexOf("const setAutoJoinRouter = (value: boolean) => {");
    expect(at).toBeGreaterThan(0);
    const block = slice(at, 220);
    expect(block).toContain("setAutoJoinRouterState(value);");
    expect(block).toContain(
      "persistPrefsRef.current?.({ autoJoinRouter: value });",
    );
    expect(code).toContain(
      "const [autoJoinRouter, setAutoJoinRouterState] = useState<boolean>(true);",
    );
    const retAt = code.indexOf("    setAutoJoinRouter,");
    expect(retAt).toBeGreaterThan(at);
  });

  it("a focus gain re-reads the car immediately, not only on link-up", () => {
    // Two [isFocused] effects now exist: the 2 s poll (whose first tick can
    // be up to 2 s after return) and the immediate REQ_STATE per focus gain.
    // One line per focus-gain refreshes mode/speed/trim AND the three
    // toggles, because they ride every STATE line.
    const ends = all("}, [isFocused]);");
    expect(ends.length).toBe(2);

    // Anchor on the effect's OWN guard (the poll has the same line — take
    // the SECOND occurrence, which sits inside the focus-gain effect) and
    // read forward, so the poll's setInterval cannot leak into the block.
    const guards = all("if (!isFocused || !connectedRef.current) return;");
    expect(guards.length).toBe(2);
    expect(ends[1]).toBeGreaterThan(guards[1]);
    const block = slice(guards[1], 400);
    expect(block).toContain("sppService.requestState().catch(() => {});");
    expect(block).toContain("bleService.requestState().catch(() => {});");
    expect(block).toContain("wifiService.requestState().catch(() => {});");
    // it fires immediately — never behind an interval
    expect(block).not.toContain("setInterval");
  });
});
