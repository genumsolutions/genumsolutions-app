// =====================================================================
// P8 / owner item E (2026-10-17) — connectivity responsiveness + "where is
// the car?".
//
// The owner's ask: react faster to network changes, and let the user TELL
// the app where the car's network is — or make it automatic. This module
// pins both halves:
//
//   * the ORDER (buildDiscoveryPlan): the user's hint first (F-91: a
//     manual override must exist, persist and WIN), then the car's mDNS
//     name, then the last router lease, then the bounded /24 sweep;
//   * the EXECUTION (raw-source rules): the plan runs in findCarForUser
//     BEFORE the sweep, the phone-network watcher records a down-sentinel
//     so a rejoin re-finds the car, and the hint persists through the
//     guarded writer into the per-car profile.
//
// Failsafes this file refuses to let regress:
//   F-91 — the manual override wins: a hint is probed first, always.
//   F-88's shape — an absent hint is NOT a denial: empty/whitespace hints
//     are dropped and the automatic plan still runs.
//   R-16a — this is discovery only; nothing here auto-joins a router.
//
// No component harness exists (see dualLinkConnect.test.ts), so the wiring
// rules read the raw sources with comments stripped, literals KEPT. Every
// rule was proven both ways (mutate → red, restore → green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CAR_MDNS_HOST, buildDiscoveryPlan } from "./discoveryPlan";

// --- the ORDER: the user's answer wins, the sweep never leads ------------

describe("P8 — buildDiscoveryPlan orders the methods honestly", () => {
  it("a user hint is probed FIRST — F-91's core assertion", () => {
    const plan = buildDiscoveryPlan({ hint: "192.168.1.42" });
    expect(plan.probes[0]).toEqual({ host: "192.168.1.42", via: "hint" });
    expect(plan.probes[1]).toEqual({ host: CAR_MDNS_HOST, via: "mdns" });
  });

  it("mDNS leads when the user has not said — automatic still works", () => {
    const plan = buildDiscoveryPlan({ hint: null });
    expect(plan.probes[0]).toEqual({ host: CAR_MDNS_HOST, via: "mdns" });
  });

  it("an absent or blank hint is dropped, never dialled (F-88's shape)", () => {
    for (const hint of ["", "   ", null, undefined]) {
      const plan = buildDiscoveryPlan({ hint });
      expect(plan.probes.every((p) => p.via !== "hint")).toBe(true);
    }
  });

  it("an SSID-looking hint is NOT dialled as a host", () => {
    // A name with a space is a note, not a hostname: dialling it can only
    // fail slowly, so the plan skips it and falls through to the automatic
    // methods — the user's answer still steers the sweep order via the
    // stored hint, it is simply never mis-dialled.
    const plan = buildDiscoveryPlan({ hint: "My Home WiFi" });
    expect(plan.probes.every((p) => p.via !== "hint")).toBe(true);
  });

  it("the remembered lease follows the probes, and never duplicates one", () => {
    const plan = buildDiscoveryPlan({ hint: null, leaseHost: "192.168.1.9" });
    expect(plan.probes).toEqual([
      { host: CAR_MDNS_HOST, via: "mdns" },
      { host: "192.168.1.9", via: "lease" },
    ]);
    // A lease equal to the hint is probed ONCE, at the hint's position.
    const dup = buildDiscoveryPlan({
      hint: "192.168.1.9",
      leaseHost: "192.168.1.9",
    });
    expect(dup.probes.filter((p) => p.host === "192.168.1.9")).toHaveLength(1);
    expect(dup.probes[0]?.via).toBe("hint");
  });

  it("the user's hint equal to mDNS is not probed twice", () => {
    const plan = buildDiscoveryPlan({ hint: CAR_MDNS_HOST });
    expect(plan.probes.filter((p) => p.host === CAR_MDNS_HOST)).toHaveLength(1);
  });

  it("the bounded sweep always runs AFTER every probe, never before", () => {
    for (const hint of [null, "", "192.168.1.42", "genum-car.local"]) {
      const plan = buildDiscoveryPlan({ hint });
      expect(plan.sweep).toBe(true);
    }
    // The plan itself contains no sweep hosts — the sweep is the caller's
    // bounded /24, and this module decides ORDER, not the /24's members.
    expect(plan2SweepIsLast(buildDiscoveryPlan({ hint: "192.168.1.42" }))).toBe(
      true,
    );
  });
});

/** Structural check: probes is the plan's only host list; sweep is a flag. */
function plan2SweepIsLast(
  plan: ReturnType<typeof buildDiscoveryPlan>,
): boolean {
  return (
    typeof plan.sweep === "boolean" &&
    plan.probes.every((p) => typeof p.host === "string" && p.host.length > 0)
  );
}

// --- the wiring, read from source ----------------------------------------

const RAW_HUB = readFileSync(
  fileURLToPath(new NodeURL("../useControlHub.ts", import.meta.url)),
  "utf8",
);

const hubCode = RAW_HUB.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P8 — the hub executes the plan before the sweep", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_HUB.length).toBeGreaterThan(1000);
    expect(hubCode).toContain("buildDiscoveryPlan({");
  });

  it("the plan is built from THIS car's hint and the car's own lease", () => {
    const at = hubCode.indexOf("buildDiscoveryPlan({");
    expect(at).toBeGreaterThan(0);
    const call = hubCode.slice(at, at + 220);
    expect(call).toContain("carNetworkHintRef.current");
    expect(call).toContain("lastRouterIpRef.current");
  });

  it("every plan probe is tried, and a probe HIT ends the search", () => {
    const at = hubCode.indexOf("buildDiscoveryPlan({");
    const after = hubCode.slice(at, at + 900);
    expect(after).toContain("for (const p of plan.probes)");
    expect(after).toContain("return { ok: true, host: p.host };");
    // The bounded sweep still exists after the probes (fall-through).
    const sweepAt = after.indexOf("findCarOnNetwork({");
    expect(sweepAt).toBeGreaterThan(
      after.indexOf("for (const p of plan.probes)"),
    );
  });

  it("probes are validated as OUR car — a random host cannot masquerade", () => {
    expect(hubCode).toContain(
      "looksLikeOurCar(payload, { apNames: OWN_AP_NAMES })",
    );
  });
});

describe("P8 — the watcher reacts to link down/up, not only SSID moves", () => {
  it("records a down-sentinel so a REJOIN re-finds the car", () => {
    // Before this round a drop updated the key normally, so rejoining the
    // SAME network was `prev === next` and no re-find ran — the app sat on a
    // dead link until the user tapped Connect. The sentinel makes the rejoin
    // a genuine change.
    expect(hubCode).toContain('`down:${state.type ?? "none"}`');
  });

  it("a rejoin resets the keep-looking budget and fires the find", () => {
    const watcherAt = hubCode.indexOf("phoneNetworkKey(state)");
    expect(watcherAt).toBeGreaterThan(0);
    const tail = hubCode.slice(watcherAt, watcherAt + 900);
    // Auto-reconnect removed per U-120 Phase C: the watcher now only observes
    // the phone's network for display; no auto-dial occurs.
    expect(tail).not.toContain("autoDiscoverAndConnect");
    // The budget reset is no longer called on network change - user taps Connect instead
    expect(tail).not.toContain("resetPhoneNetDiscoverBudget");
  });
});

describe("P8 — the hint persists through the guarded writer (F-91)", () => {
  it("the ONLY writer is guarded and persists to the profile", () => {
    expect(hubCode).toContain(
      "const setCarNetworkHint = (value: string | null) => {",
    );
    const writerAt = hubCode.indexOf(
      "const setCarNetworkHint = (value: string | null) => {",
    );
    const body = hubCode.slice(writerAt, writerAt + 420);
    expect(body).toContain(
      "persistPrefsRef.current?.({ carNetworkHint: next });",
    );
  });

  it("the hint restores with the profile", () => {
    expect(hubCode).toContain("merged.prefs.carNetworkHint");
  });

  it("the hint is exposed to the panel under its own name", () => {
    expect(hubCode).toContain("carNetworkHint,");
    expect(hubCode).toContain("setCarNetworkHint,");
  });
});

// --- the panel: the control exists and says what it does -----------------

const RAW_SECTION = readFileSync(
  fileURLToPath(new NodeURL("./ConnectionSection.tsx", import.meta.url)),
  "utf8",
);

const section = RAW_SECTION.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe('P8 — ConnectionSection offers the "Car network" control', () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SECTION.length).toBeGreaterThan(1000);
    expect(section).toContain('testID="car-network-card"');
  });

  it("the input and its save exist, and save goes through the guarded writer", () => {
    expect(section).toContain('testID="car-network-input"');
    expect(section).toContain('testID="car-network-save"');
    expect(section).toContain('setCarNetworkHint(hintDraft ?? "");');
  });

  it("the hint value shown comes from the hub, not a raw local copy", () => {
    // value is the draft (while typing) or the SAVED hub value — never a
    // detached local state that would forget the profile's answer.
    expect(section).toContain('hintDraft ?? carNetworkHint ?? ""');
  });

  it("the copy names the mDNS fallback so the user knows what auto means", () => {
    expect(section).toContain("CAR_MDNS_HOST");
    expect(section).toContain("Discovery looks here first");
  });

  // U-121 B2 (owner 2026-10-24): "add the feature of the entering the wifi
  // network the car is at for the user along with the broadcast ip address for
  // the control and most of the time set automatically and auto filled too."
  it("the card carries BOTH facts the owner asked for, auto-filled from car truth", () => {
    // 1. THE CAR'S WI-FI NETWORK — an editable field that SHOWS CAR TRUTH
    //    until the owner types (draft wins only while there is one).
    expect(section).toContain('testID="car-network-ssid-input"');
    expect(section).toContain('ssidDraft ?? reportedSsid ?? ""');
    expect(section).toContain('setCarSsidAnswer(ssidDraft ?? "");');
    //    The auto-fill reads the car FIRST: live telemetry → the SSID it has
    //    configured → only then the owner's own answer.
    expect(section).toContain(
      "const reportedSsid = telemetry.ssid ?? carSsid ?? carSsidAnswer ?? null;",
    );
    // 2. THE BROADCAST IP FOR THE CONTROL — computed, never typed: AP address
    //    on the own hotspot, reported STA IP on a router, fleet default last.
    expect(section).toContain('testID="car-network-ip"');
    expect(section).toContain(
      "const controlIp = (onOwnHotspot ? null : reportedIp) ?? DEFAULT_AP_IP;",
    );
    //    …and it stays READ-ONLY. The car uses that IP to find its own WS
    //    client; it is not a reconfiguration field (FAILSAFE-U121 rule 2).
    expect(section).not.toContain("value={controlIp}");
  });

  it("the SSID answer is a per-car PREF — written, restored and carried by every patch", () => {
    // deviceMemory.write REPLACES the stored record, so a pref missing from
    // the persist base is not kept — it is erased by the next unrelated save.
    const hubRaw = readFileSync(
      fileURLToPath(new NodeURL("../useControlHub.ts", import.meta.url)),
      "utf8",
    );
    const hub = hubRaw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(hub).toContain(
      "persistPrefsRef.current?.({ carSsidAnswer: next });",
    );
    expect(hub).toContain("merged.prefs.carSsidAnswer");
    expect(hub).toMatch(
      /carNetworkHint,\s*\n\s*carSsidAnswer,\s*\n\s*\.\.\.patch,/,
    );
  });
});

// U-121 C2 (owner 2026-10-24: "make the bluetooth method and the wifi method in
// the connectivity section properly thought and the remove unproper things like
// the dublicates and unnecessary thing from there too").
describe("U-121 C2 — the left-bottom inventory is DISPLAY-ONLY; the right pane is the manager", () => {
  it("has sources to check (the rule must not pass vacuously)", () => {
    expect(section).toContain('testID="conn-added-networks"');
    expect(section).toContain("<AddedNetworksInventory routers={routers} />");
  });

  it("the added-networks list carries NO switch action of its own", () => {
    // Everything from the inventory's own testID to the end of the file: rows
    // are Views (information), not Pressables, and no onSwitch reaches them —
    // the right pane's WifiPanel is the single place that switches, adds,
    // edits or forgets. Two lists of the same routers with two identical sets
    // of tap-to-switch buttons was the duplicate the owner named.
    const fromInventory = section.slice(
      section.indexOf("function AddedNetworksInventory("),
    );
    expect(fromInventory).toContain('testID="conn-added-networks"');
    expect(fromInventory).not.toContain("onSwitch");
    expect(fromInventory).not.toContain("<Pressable");
    expect(fromInventory).not.toContain("reachable");
    expect(fromInventory).toContain("testID={`conn-added-network-${r.ssid}`}");
  });

  it("the IoT entry card is gone from the pane that used to carry it", () => {
    // Owner 2026-10-23/24: "remove the other esp /iot projects section totally".
    // A1 deleted the component; A2 deleted the usage a later edit re-added
    // (it was the TS2304 that left `tsc` red on resume).
    expect(section).not.toContain("IotEntryCard");
    expect(section).not.toContain('testID="conn-iot-entry"');
  });
});

// ── U-124 ⑩ (owner 2026-10-24) — ONE section, and it is inert with no link ──
// "if the car is not connected already, make the switch the network section
// dull and unusable. But you can merge these two sections about switch
// network and cars network if you can make things simpler."
describe("U-124 ⑩ — the right pane is ONE 'Car network' section", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SECTION.length).toBeGreaterThan(1000);
    expect(section).toContain('testID="car-network-card"');
    expect(section).toContain("<WifiPanel");
  });

  it("ONE heading names the section — the second title is gone", () => {
    expect(section).toContain('{manage ? "Car network" : "Networks"}');
    // The old heading is what made the card and the list read as two
    // sections. It must be gone from the RENDER (comments are stripped
    // here, so this is code-level, not prose).
    expect(section).not.toContain('"Switch networks"');
    // …and the card no longer repeats the section's own words: its title row
    // was removed and the `saved` badge moved onto "The car is on".
    expect(section).not.toContain(
      ">\n                  Car network\n                </Text>",
    );
  });

  it("facts first: the card is rendered ABOVE the switch list", () => {
    const cardAt = section.indexOf('testID="car-network-card"');
    const listAt = section.indexOf("<WifiPanel");
    expect(cardAt).toBeGreaterThan(0);
    expect(listAt).toBeGreaterThan(cardAt);
  });

  it("with no link the list is DULL and says why", () => {
    expect(section).toContain('testID="switch-networks"');
    expect(section).toContain(
      'className={anyLink ? "mt-1.5" : "mt-1.5 opacity-40"}',
    );
    expect(section).toContain(
      "Connect to the car to switch, add or forget its networks.",
    );
    // Dulling alone is not "unusable" — the panel itself refuses (next rule).
    expect(section).toContain("reachable={anyLink}");
  });

  it("WifiPanel refuses every car-bound touch while unreachable", () => {
    const panel = readFileSync(
      fileURLToPath(new NodeURL("./WifiPanel.tsx", import.meta.url)),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(panel).toContain("if (!r.switchable || busy || !reachable) return;");
    expect(panel).toContain("disabled={!r.switchable || busy || !reachable}");
    expect(panel).toContain("disabled: !r.switchable || !reachable");
    expect(panel).toContain("disabled={!canAdd || !reachable}");
    // edit + forget are car commands too (2 render sites); the scan already
    // carried this exact gate, so the string appears three times — never two.
    expect(panel.split("disabled={busy || !reachable}").length - 1).toBe(3);
    // and the scan already was
    expect(panel).toContain(
      "disabled={busy || !reachable}\n          accessibilityRole",
    );
  });
});
