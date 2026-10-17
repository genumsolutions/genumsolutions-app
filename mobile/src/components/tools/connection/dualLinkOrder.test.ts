// =====================================================================
// P3 / owner item A (2026-10-17) — dual-link connect ORDERING + honesty.
//
// The in-between state of a second-link raise was invisible: one shared
// `connecting` flag, no owner of "WHICH link is coming up", and a car that
// refused the raise (P4's LINKCAP latch flipping to 0 mid-flight) made the
// user wait for a native/socket failure instead of reading the car's honest
// reason. `linkOrder.ts` is that owner, and `ConnectionSection` renders its
// one line while the raise is pending.
//
// The ORDERING half needs no new code and this file keeps it pinned: neither
// `handleConnect` nor `handleWifiConnect` flips a link flag before the link
// is confirmed (BT truth after the native connect resolves, Wi-Fi truth only
// after the car ANSWERS — `waitForCarAnswer`). The Remote chrome's "BT+WiFi"
// label requires `connected && wifiConnected` — both live, never a wish.
//
// F-88 runs through every branch below: only a car that REPORTED
// `linkCap === false` may say "refused"; an absent verdict never mutes or
// denies anything, and a raise always gets to finish its own honest outcome.
// No component harness exists (see dualLinkConnect.test.ts), so the wiring
// rules read the raw sources with comments stripped, literals KEPT. Every
// rule was proven both ways (mutate → red, restore → green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { describeSecondLink, type SecondLinkFacts } from "./linkOrder";

// --- part A: the pure decision, in every link shape ----------------------

const facts = (over: Partial<SecondLinkFacts>): SecondLinkFacts => ({
  btLinked: false,
  wifiConnected: false,
  connecting: false,
  connectingAddress: null as string | null,
  linkCap: null as boolean | null,
  ...over,
});

describe("P3 — describeSecondLink names the in-flight raise", () => {
  it("a pending raise beside exactly one live link IS the second raise", () => {
    // Wi-Fi live, Bluetooth dialling (its own marker): the raise is Bluetooth.
    const up = describeSecondLink(
      facts({ wifiConnected: true, connecting: true }),
    );
    expect(up.raise).toBe("wifi");
    expect(up.line).toBe("Wi-Fi coming up…");
    expect(up.refusedByCar).toBe(false);

    const upBt = describeSecondLink(
      facts({ wifiConnected: true, connectingAddress: "AA:BB:CC:DD:EE:FF" }),
    );
    expect(upBt.raise).toBe("bluetooth");
    expect(upBt.line).toBe("Bluetooth coming up…");

    // Mirror: Bluetooth live, Wi-Fi dialling.
    const upWifi = describeSecondLink(
      facts({ btLinked: true, connecting: true }),
    );
    expect(upWifi.raise).toBe("wifi");
    expect(upWifi.line).toBe("Wi-Fi coming up…");
  });

  it("the line is a process claim, never an establishment claim", () => {
    // "coming up" — neither handler may say connected, and this module may
    // not either: the wording never contains "connected"/"linked".
    for (const line of [
      describeSecondLink(facts({ wifiConnected: true, connecting: true })).line,
      describeSecondLink(
        facts({ wifiConnected: true, connectingAddress: "AA:00" }),
      ).line,
    ]) {
      expect(line).toBeTruthy();
      expect(line).toContain("coming up");
      expect(line!.includes("Connected")).toBe(false);
      expect(line!.includes("linked")).toBe(false);
    }
  });

  it("a raise with no car verdict is never 'refused' — F-88", () => {
    const up = describeSecondLink(
      facts({ wifiConnected: true, connecting: true, linkCap: null }),
    );
    expect(up.refusedByCar).toBe(false);
    expect(up.line).toContain("coming up");
  });

  it("a car that REPORTED a refusal is named while the raise is pending", () => {
    const refused = describeSecondLink(
      facts({ btLinked: true, connecting: true, linkCap: false }),
    );
    expect(refused.raise).toBe("wifi");
    expect(refused.refusedByCar).toBe(true);
    expect(refused.line).toContain("refused Wi-Fi");
    expect(refused.line).toContain("low memory");
  });

  it("a `true` verdict never manufactures a denial — F-88's other side", () => {
    const capable = describeSecondLink(
      facts({ btLinked: true, connecting: true, linkCap: true }),
    );
    expect(capable.refusedByCar).toBe(false);
    expect(capable.line).toBe("Wi-Fi coming up…");
  });

  it("zero or two links live ⇒ NOT a second raise — the gate stays silent", () => {
    // A FIRST raise beside nothing is never gated (the car never refuses the
    // first link, P4) — even mid-dial, no second-link line may appear.
    const first = describeSecondLink(facts({ connecting: true }));
    expect(first.raise).toBeNull();
    expect(first.line).toBeNull();
    expect(first.refusedByCar).toBe(false);

    // Both live: the raise is not "second" (and there is nothing left to
    // start) — silent.
    const both = describeSecondLink(
      facts({
        btLinked: true,
        wifiConnected: true,
        connecting: true,
        linkCap: false,
      }),
    );
    expect(both.raise).toBeNull();
    expect(both.line).toBeNull();
    expect(both.refusedByCar).toBe(false);
  });

  it("a refusal verdict with NO raise pending says nothing here", () => {
    // The P5 mute owns that state ("linkCap === false" gating the offer);
    // this module only speaks while a raise is in flight.
    const idle = describeSecondLink(
      facts({ wifiConnected: true, linkCap: false }),
    );
    expect(idle.raise).toBeNull();
    expect(idle.line).toBeNull();
    expect(idle.refusedByCar).toBe(false);
  });

  it("the Bluetooth marker wins over the shared connecting flag", () => {
    // handleConnect never sets shared `connecting`; its own marker identifies
    // the pending dial. A stale `connecting` with a live BT link must not
    // produce a Bluetooth raise: raising the LIVE transport again is a
    // re-dial, not a second raise — and both live ⇒ silent anyway.
    const redial = describeSecondLink(
      facts({
        wifiConnected: true,
        btLinked: true,
        connecting: true,
        connectingAddress: "AA:00",
      }),
    );
    expect(redial.raise).toBeNull();
  });
});

// --- part B: the ordering invariant, read from the hub source ------------

const RAW_HUB = readFileSync(
  fileURLToPath(new NodeURL("../useControlHub.ts", import.meta.url)),
  "utf8",
);

const hubCode = RAW_HUB.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P3 — the app never claims a link before it is confirmed", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_HUB.length).toBeGreaterThan(1000);
    expect(hubCode).toContain("const handleConnect = useCallback(");
    expect(hubCode).toContain("const handleWifiConnect = useCallback(");
  });

  it("the Bluetooth connect sets truth only AFTER the native dial resolves", () => {
    // The `setBtLinked(true)` inside handleConnect must come after the await
    // of sppService.connect — never before it.
    const fnAt = hubCode.indexOf("const handleConnect = useCallback(");
    expect(fnAt).toBeGreaterThan(0);
    const body = hubCode.slice(fnAt, fnAt + 2600);
    const awaitAt = body.indexOf("await sppService.connect(device.address)");
    const flipAt = body.indexOf("setBtLinked(true)");
    expect(awaitAt).toBeGreaterThan(0);
    expect(flipAt).toBeGreaterThan(awaitAt);
  });

  it("the Wi-Fi connect flips truth only after the car ANSWERS", () => {
    // `setWifiConnected(true)` lives behind `waitForCarAnswer` — a socket open
    // alone is a half-open link (U-93), never a truth flip.
    const fnAt = hubCode.indexOf("const handleWifiConnect = useCallback(");
    expect(fnAt).toBeGreaterThan(0);
    const body = hubCode.slice(fnAt, fnAt + 2600);
    const awaitAt = body.indexOf("await wifiService.waitForCarAnswer()");
    const flipAt = body.indexOf("setWifiConnected(true)");
    expect(awaitAt).toBeGreaterThan(0);
    expect(flipAt).toBeGreaterThan(awaitAt);
  });
});

// --- part C: the panel renders the one line ------------------------------

const RAW_SECTION = readFileSync(
  fileURLToPath(new NodeURL("./ConnectionSection.tsx", import.meta.url)),
  "utf8",
);

const section = RAW_SECTION.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("P3 — ConnectionSection shows the second raise while it runs", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW_SECTION.length).toBeGreaterThan(1000);
    expect(section).toContain("describeSecondLink");
  });

  it("the hub facts feeding the decision are all destructured", () => {
    for (const f of [
      "btLinked",
      "connecting",
      "connectingAddress",
      "wifiConnected",
      "linkCap",
    ]) {
      expect(section).toContain(f);
    }
  });

  it("the decision is fed from the live facts, not from the mute gate", () => {
    const callAt = section.indexOf("describeSecondLink({");
    expect(callAt).toBeGreaterThan(0);
    const call = section.slice(callAt, callAt + 220);
    expect(call).toContain("btLinked");
    expect(call).toContain("wifiConnected");
    expect(call).toContain("connecting");
    expect(call).toContain("connectingAddress");
    expect(call).toContain("linkCap");
  });

  it("the line renders ONLY when the decision produced one", () => {
    // A raise-less state (first connect, both live, none live) renders
    // nothing — the line must never be a second opinion about liveness.
    // (Whitespace-flattened: prettier wraps the ternary in the JSX — the
    // decision shape is the rule, not its line breaks.)
    const flat = section.replace(/\s+/g, " ");
    expect(flat).toContain("secondLink.line ?");
    expect(flat).toContain('tone={secondLink.refusedByCar ? "error" : "info"}');
  });
});
