// =====================================================================
// P5 / owner item F (2026-10-17) — the car's LINKCAP verdict reaches the app
// and gates the SECOND-link raise.
//
// Firmware 1.3.13 (P4, car `50e5522`) reports the car's link-admission verdict
// on BOTH surfaces: `;LINKCAP=0|1` on every STATE line (so a Bluetooth-only
// app reads it without a WS round-trip) and `"link_cap":0|1` in the WS JSON.
// P5 is the app half: parse it on both surfaces, adopt it into the hub, and —
// only when the raise WOULD be the second link — disable that connect action
// with the car's own reason instead of offering a button that can only be
// refused live (Q4 default: disable with a reason, don't let it fail).
//
// F-88 is the invariant this file exists to pin: CAPABILITY ABSENT IS NOT
// CAPABILITY DENIED. A pre-1.3.13 car never sends the field, so every
// "missing"/garbage path must leave `linkCap` UNSET and the connect buttons
// ENABLED. One falsy read of `linkCap` anywhere (`!linkCap`, `linkCap ||
// …` gates) would strand an honest older car behind a fake refusal.
//
// No component test harness exists in this repo (no React Testing Library —
// see dualLinkConnect.test.ts), so the wiring rules read the raw sources with
// comments stripped, string literals KEPT. Each rule was proven in BOTH
// directions (mutate → red, restore → green) when it was written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTelemetryLine } from "../../../services/carProtocol";
import { targetUnavailableReason } from "./methods";

// --- part A: the parse — both surfaces, F-88 on every absent/garbage path ---

describe("P5 — parseTelemetryLine reads the car's LINKCAP verdict", () => {
  it("`;LINKCAP=0` = the car REFUSED the second link (latched, incumbent kept)", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=4WD4M;SPD=0;TRIM=0;STATUS=Ready;WIFI=ON;BT=ON;AUTOJOIN=ON;LINKCAP=0",
    );
    expect(t.linkCap).toBe(false);
  });

  it("`;LINKCAP=1` = a second link is (or could be) admitted", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=4WD4M;SPD=0;TRIM=0;STATUS=Ready;WIFI=ON;BT=ON;AUTOJOIN=ON;LINKCAP=1",
    );
    expect(t.linkCap).toBe(true);
  });

  it("an older car (no LINKCAP key) stays ABSENT — capable, never denied", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=4WD4M;SPD=0;TRIM=0;STATUS=Ready;WIFI=ON;BT=ON;AUTOJOIN=ON",
    );
    expect(t.linkCap).toBeUndefined();
  });

  it("an empty or non-numeric LINKCAP stays ABSENT, too", () => {
    // The emit is %d so empty/garbage should never happen on a real car — but
    // the F-88 shape means a malformed frame must never become a denial either.
    const empty = parseTelemetryLine("STATE;MODE=4WD4M;STATUS=Ready;LINKCAP=");
    expect(empty.linkCap).toBeUndefined();
    const junk = parseTelemetryLine(
      "STATE;MODE=4WD4M;STATUS=Ready;LINKCAP=maybe",
    );
    expect(junk.linkCap).toBeUndefined();
  });

  it("the verdict coexists with the toggles it sits beside on the same line", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=4WD4M;WIFI=ON;BT=ON;AUTOJOIN=OFF;LINKCAP=0;RST=POWER_ON;BC=41;CC=3",
    );
    expect(t.wifiEnabled).toBe(true);
    expect(t.bootAutojoin).toBe(false);
    expect(t.linkCap).toBe(false);
    expect(t.bootCount).toBe(41);
  });
});

describe("P5 — the WS JSON status carries the same verdict", () => {
  it("`link_cap:0` = refused; `link_cap:1` = admitted", () => {
    expect(parseTelemetryLine('{"link_cap":0}').linkCap).toBe(false);
    expect(parseTelemetryLine('{"link_cap":1}').linkCap).toBe(true);
  });

  it("no `link_cap` key (pre-1.3.13 /status) leaves it ABSENT", () => {
    const t = parseTelemetryLine(
      '{"status":"OK","mode":"4WD4M","ip":"1.2.3.4"}',
    );
    expect(t.linkCap).toBeUndefined();
  });

  it("a wrong-TYPE link_cap does not manufacture a verdict", () => {
    // typeof-gated: only a genuine number may speak for the car.
    expect(parseTelemetryLine('{"link_cap":"0"}').linkCap).toBeUndefined();
    expect(parseTelemetryLine('{"link_cap":null}').linkCap).toBeUndefined();
    expect(parseTelemetryLine('{"link_cap":true}').linkCap).toBeUndefined();
  });
});

// --- part B: the model — a refusal becomes a renderable reason, first links
//     are never gated ------------------------------------------------------

describe("P5 — targetUnavailableReason refuses only SECOND-link raises", () => {
  const refused = (id: Parameters<typeof targetUnavailableReason>[0]) =>
    targetUnavailableReason(id, {
      carOnOwnRouter: false,
      linkCapRefused: true,
    });

  it("a car-refused second raise mutes the dial targets WITH a reason", () => {
    // Q4's default: disable with the car's own honest reason, don't let it
    // fail live. Both directions pinned: the reason exists AND it names the
    // one-link limit so the user can act on it.
    for (const id of ["bt-spp", "car-wifi"] as const) {
      const why = refused(id);
      expect(why).toBeTruthy();
      expect(why).toContain("one link only");
    }
  });

  it("the router-manager target is NOT gated — it rides the live link", () => {
    // bt-routers never raises a transport; refusing its management would make
    // the incumbent link WORSE, and the car never refuses it.
    expect(refused("bt-routers")).toBeNull();
  });

  it("F-88: an absent/unknown verdict never manufactures a refusal", () => {
    // The exact car half of the invariant: a pre-1.3.13 car (ctx without
    // linkCapRefused) must keep every dial target offered.
    expect(
      targetUnavailableReason("bt-spp", { carOnOwnRouter: false }),
    ).toBeNull();
    expect(
      targetUnavailableReason("car-wifi", { carOnOwnRouter: false }),
    ).toBeNull();
  });

  it("F-88 half two: the gate keys on TRUE refusal, not on truthiness", () => {
    // `linkCapRefused: false` is an explicit "capable" — a falsy-read gate
    // would conflate it with the absent case above. (In TS these are distinct
    // call shapes; both must come back null so no caller can merge them.)
    expect(
      targetUnavailableReason("bt-spp", {
        carOnOwnRouter: false,
        linkCapRefused: false,
      }),
    ).toBeNull();
  });
});

// --- part C: the panel wiring — the gate exists, is strict, and hits both
//     connect actions -------------------------------------------------------

const RAW_SECTION = readFileSync(
  fileURLToPath(new NodeURL("./ConnectionSection.tsx", import.meta.url)),
  "utf8",
);

const section = RAW_SECTION.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P5 — ConnectionSection gates the second-link raise on the car's verdict", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SECTION.length).toBeGreaterThan(1000);
    expect(section).toContain("function TargetBody({");
    expect(section).toContain('testID="conn-bt-scan"');
  });

  it("the hub's linkCap is destructured — the panel reads the verdict at all", () => {
    expect(section).toContain("linkCap,\n    linkVerified,");
  });

  it("the gate keys on a STRICT `false`, never a falsy read", () => {
    // THE F-88 rule, at the point of use. `linkCap === false` = only an
    // explicit car refusal gates; `null` (not yet read) must keep the buttons
    // answering. One `!linkCap` in a gate and every older car is stranded.
    expect(section).toContain("linkCap === false");
    expect(section).not.toContain("&& !linkCap");
    expect(section).not.toContain("!linkCap &&");
    expect(section).not.toContain("|| !linkCap");
  });

  it("the refusal only bites when the raise IS a second link", () => {
    // `btLive !== wifiConnected` : exactly one link live ⇒ the next connect
    // raises the OTHER transport. With zero links up (first raise — the car
    // never refuses it) or both up (nothing to raise) the gate is inert.
    expect(section).toContain("btLive !== wifiConnected");
    const gate = section.slice(
      section.indexOf("const secondLinkRefused"),
      section.indexOf("const secondLinkRefused") + 240,
    );
    expect(gate).toContain("linkCap === false");
    expect(gate).toContain("btLive !== wifiConnected");
  });

  it("the car-refused verdict reaches BOTH connect actions", () => {
    // The verdict flows into the model (`targetUnavailableReason` ctx) which
    // owns the reason string:
    expect(section).toContain("linkCapRefused: secondLinkRefused");
    // through MethodSetup:
    expect(section).toContain("secondLinkRefused={secondLinkRefused}");
    // and the Bluetooth scan button honours the resulting unavailable reason
    // by disabling, not by offering a dial that can only fail:
    const scanAt = section.indexOf('testID="conn-bt-scan"');
    expect(scanAt).toBeGreaterThan(0);
    const scanBlock = section.slice(scanAt - 320, scanAt + 40);
    expect(scanBlock).toContain("Boolean(unavailable)");
    expect(scanBlock).toContain("onPress={onScanBluetooth}");
  });

  it("the found-car list is NOT hidden by a refusal — it is muted, not gone", () => {
    // Refusal mutes the action with a reason; it must not also hide the
    // inventory a real recovery needs (the paired list lives outside the
    // connect gate; see dualLinkConnect.test.ts which already pins that).
    expect(section).toContain("<BtInventory");
  });
});

// --- part D: the hub wiring — adopt on live truth, expose, never persist ---

const RAW_HUB = readFileSync(
  fileURLToPath(new NodeURL("../useControlHub.ts", import.meta.url)),
  "utf8",
);

const hub = RAW_HUB.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P5 — useControlHub adopts and exposes the car's verdict", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_HUB.length).toBeGreaterThan(1000);
    expect(hub).toContain("const [linkCap, setLinkCap]");
  });

  it("the verdict state starts UNKNOWN, not denied and not capable", () => {
    // `boolean | null` with null initial — a cold start on an old car must
    // look exactly like "the car has not said", never like "0".
    expect(hub).toContain(
      "const [linkCap, setLinkCap] = useState<boolean | null>(null);",
    );
  });

  it("the verdict is adopted from the live telemetry stream", () => {
    // It rides every STATE line and every WS JSON frame; the adopt must read
    // the parsed stream field, strictly boolean.
    expect(hub).toContain('typeof t.linkCap === "boolean"');
    expect(hub).toContain("setLinkCap(t.linkCap);");
  });

  it("no commit-grace guards the adopt — it is a car fact, not a user edit", () => {
    // The three toggles run the grace because a stale reply can roll back an
    // optimistic user flip. No user ever flips LINKCAP from the app, so a
    // protect() call here would be cargo and would delay car truth.
    expect(hub).not.toContain('protect("linkCap"');
  });

  it("the verdict is exposed to panels under its own name", () => {
    expect(hub).toContain("linkCap,");
  });

  it("the verdict is NEVER persisted as a stored preference", () => {
    // It is a LIVE fact mirrored from the car's latched verdict; the car
    // re-broadcasts it on every line, so persisting it would resurrect a
    // stale refusal after the car had already moved on (the F-85 shape,
    // borrowed one field left). The three transport toggles on the SAME
    // adoption block persist because they are store-owned; this one is not.
    expect(hub).not.toMatch(/persistPrefsRef\.current\?\.\(\{[^}]*linkCap/);
    expect(hub).not.toContain("persistPrefs({ linkCap");
    expect(hub).not.toContain("linkCap: t.linkCap }");
  });
});
