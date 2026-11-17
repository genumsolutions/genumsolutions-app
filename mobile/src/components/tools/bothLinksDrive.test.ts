// =====================================================================
// bothLinksDrive.test.ts — Q3 (owner 2026-10-22) ratified:
//
//   "with both links live, drive commands go over BOTH (current fan-out,
//    idempotent on the car) or over one primary with the other as
//    status-only? Default = both, since EVERY_LINK_COMMANDS already
//    assumes it."  (PLAN-2026-10-15 open question Q3)
//
// So the decision is now PINNED, not open: there is no primary link.
// `sendCommand` passes `chosenRadio: wirelessMethod` — the radio the user
// raised the LATEST Wi-Fi flow in (U-124 owner item ⑧: "i can connect to the
// wifi signal too when the bluetooth is already connected") — which is a
// TIE-BREAKER, never a primary: `routeCommand` only ever ADDS the chosen
// radio to the fan-out, it never removes one that mode parity already allows,
// so a both-transports mode still reaches both radios and a mode that lists
// only Bluetooth still reaches a Wi-Fi link the user deliberately dialled.
// Broadcast lines (mode tokens + emergency) ride every live link. Idempotency
// is the CAR's half — every line carries an absolute target (SPD140, ESTOP, a
// concrete mode token), and the app never puts a relative token like
// MODECYCLE on the wire (cycleMode resolves it first), so a copy on the
// second link changes nothing.
//
// WHICH FILE THIS READS (F-83): the RAW `useControlHub.ts` source,
// comments stripped — the same convention as oneActiveLink.test.ts and
// remoteChrome.test.ts. Every rule was mutation-proven when written
// (mutate → red, restore → green).
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

import { routeCommand } from "./commandRouting";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped — character literals NOT blanked. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const hub = strip(raw("./useControlHub.ts"));

/** The body of `const <name> = useCallback(` … up to the next top-level
    `const <other> = useCallback(`. Anchor-based: empty slice ⇒ loud failure. */
function hubBody(name: string, nextName: string): string {
  const start = hub.indexOf(`const ${name} = useCallback(`);
  const end = hub.indexOf(`const ${nextName} = useCallback(`);
  if (start < 0 || end <= 0 || end <= start) return "";
  return hub.slice(start, end);
}

describe("Q3 — both links live: the fan-out has NO primary link", () => {
  it("has a source to check (the rules must not pass vacuously)", () => {
    expect(hub.length).toBeGreaterThan(5000);
    expect(hub).toContain("const sendCommand = useCallback(");
    expect(hub).toContain("const sendSystemLine = useCallback(");
  });

  it("sendCommand routes through routeCommand with the raised radio as tie-breaker", () => {
    const body = hubBody("sendCommand", "sendSystemLine");
    expect(body.length).toBeGreaterThan(100);
    // The Q3 decision, qualified by owner item ⑧: no link is PRIMARY (mode
    // parity still decides which radios MAY carry a command), but the radio
    // the user dialled is always added to the fan-out — so a Wi-Fi link
    // raised beside a Bluetooth link carries commands even in a BT-only mode.
    expect(body).toContain("chosenRadio: wirelessMethod,");
    expect(body).not.toContain("chosenRadio: null,");
    expect(body).toContain("routeCommand({");
    // The broadcast set is consulted per command, so mode tokens and the
    // emergency/neutral lines reach every live radio.
    expect(body).toContain("broadcast = EVERY_LINK_COMMANDS.has(");
    // Both radios can actually carry the result (BT fan-out + WS fan-out).
    expect(body).toContain(
      "if (route.bt && connected && sppService.isConnected)",
    );
    expect(body).toContain("if (route.ws && wifiService.isConnected)");
  });

  it("a both-transports mode over two live links routes to BOTH radios", () => {
    const r = routeCommand({
      broadcast: false,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
      modeUsesWifi: true,
      chosenRadio: null,
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("the tie-breaker only ever ADDS the radio the user dialled", () => {
    // Owner item ⑧'s whole point: a BT-mode session with a live Wi-Fi link
    // the user raised must ALSO carry over Wi-Fi ("control the car through
    // the wifi with the broadcasted ip controls"), and the mirror holds —
    // chosen=bluetooth never removes a Wi-Fi link that mode parity allows.
    expect(
      routeCommand({
        broadcast: false,
        btLive: true,
        wsLive: true,
        modeUsesBt: true,
        modeUsesWifi: false,
        chosenRadio: "wifi",
      }),
    ).toEqual({ bt: true, ws: true });
    expect(
      routeCommand({
        broadcast: false,
        btLive: true,
        wsLive: true,
        modeUsesBt: false,
        modeUsesWifi: true,
        chosenRadio: "bluetooth",
      }),
    ).toEqual({ bt: true, ws: true });
    // A chosen radio whose link is NOT live still cannot carry anything.
    expect(
      routeCommand({
        broadcast: false,
        btLive: true,
        wsLive: false,
        modeUsesBt: true,
        modeUsesWifi: false,
        chosenRadio: "wifi",
      }),
    ).toEqual({ bt: true, ws: false });
  });

  it("broadcast lines ride every live link, never just one", () => {
    const r = routeCommand({
      broadcast: true,
      btLive: true,
      wsLive: true,
      modeUsesBt: false,
      modeUsesWifi: false,
      chosenRadio: null,
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("the safety + mode tokens stay in EVERY_LINK_COMMANDS", () => {
    // The set literal itself (source-level): the emergency lines and the
    // concrete mode tokens — all absolute targets, so a duplicate copy on
    // the second link cannot double-apply anything.
    const setStart = hub.indexOf("const EVERY_LINK_COMMANDS = new Set([");
    expect(setStart).toBeGreaterThan(0);
    const setEnd = hub.indexOf("]);", setStart);
    expect(setEnd).toBeGreaterThan(setStart);
    const setLit = hub.slice(setStart, setEnd);
    for (const token of [
      "ESTOP",
      "SPD0",
      "S",
      "REQ_STATE",
      "4WD4M",
      "ROUTERS",
    ]) {
      expect(setLit).toContain(`"${token}"`);
    }
    // No RELATIVE token may ride the fan-out: MODECYCLE advances on every
    // apply, so a copy on the second link would double-advance the mode.
    expect(setLit).not.toContain('"MODECYCLE"');
    expect(setLit).not.toContain('"MODENEXT"');
    expect(setLit).not.toContain('"MODEPREV"');
  });
});
