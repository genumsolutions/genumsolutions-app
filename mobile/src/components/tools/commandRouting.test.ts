// =====================================================================
// commandRouting.test.ts — pins for the hub's sendCommand routing table.
//
// The bug this pins (owner bench report 2026-10-02 evening, item ④b): a
// drive command could be stranded on a STALE link when TWO links were
// live. sendCommand routed non-broadcast lines by the ACTIVE MODE's
// transport alone; with a Bluetooth link still up and a home-router (STA)
// WebSocket also live, a BT-transport mode sent drive letters over BT
// only — the phone sat on the router, the car never moved, and the deck
// looked alive while being deaf.
//
// The rule that fixes it (R-4 extension): fleet parity still decides
// (a WiFi-mode drive letter never goes to a BT-only arrangement and vice
// versa) BUT the user's CHOSEN method — the LinkManager's active link —
// is the tie-breaker whenever two links are live: the link the user
// deliberately picked always carries the command.
// =====================================================================
import { describe, expect, it } from "vitest";

import { routeCommand } from "./commandRouting";

const base = {
  broadcast: false,
  btLive: false,
  wsLive: false,
  modeUsesBt: false,
  modeUsesWifi: false,
  chosenRadio: null,
} as const;

describe("routeCommand — single live link wins regardless of mode", () => {
  it("only BT live: everything rides BT", () => {
    const r = routeCommand({ ...base, btLive: true });
    expect(r).toEqual({ bt: true, ws: false });
  });

  it("only WS live: everything rides WS (the 4WD4M-over-WS rule)", () => {
    const r = routeCommand({ ...base, wsLive: true });
    expect(r).toEqual({ bt: false, ws: true });
  });
});

describe("routeCommand — broadcast (system/emergency) commands", () => {
  it("rides EVERY live link", () => {
    const r = routeCommand({
      ...base,
      broadcast: true,
      btLive: true,
      wsLive: true,
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("rides only the link that is actually live", () => {
    const r = routeCommand({ ...base, broadcast: true, wsLive: true });
    expect(r).toEqual({ bt: false, ws: true });
  });
});

describe("routeCommand — both links live: mode parity + chosen tie-breaker", () => {
  it("a mode using both radios sends over both (unchanged)", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
      modeUsesWifi: true,
      chosenRadio: "wifi",
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("THE FIX: BT-transport mode + chosen WS — the WS link is ADDED (never stranded)", () => {
    // Parity keeps the mode's own radio (both links reach the same car, so
    // an extra copy is harmless); the tie-break ADDS the user's chosen link
    // so a stale secondary link can never be the only carrier.
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
      chosenRadio: "wifi",
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("BT-transport mode + chosen BT keeps BT only (no WS — unchanged)", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
      chosenRadio: "bluetooth",
    });
    expect(r).toEqual({ bt: true, ws: false });
  });

  it("no chosen link known: falls back to pure mode parity (previous behavior)", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
    });
    expect(r).toEqual({ bt: true, ws: false });
  });

  it("wifi-transport mode + chosen BT: the chosen link gets it too", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesWifi: true,
      chosenRadio: "bluetooth",
    });
    expect(r).toEqual({ bt: true, ws: true });
  });

  it("a mode using neither radio still reaches the chosen link (single-link rule)", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      chosenRadio: "wifi",
    });
    expect(r).toEqual({ bt: false, ws: true });
  });

  it("an 'internet'-radio choice leaves the two live links to mode parity", () => {
    const r = routeCommand({
      ...base,
      btLive: true,
      wsLive: true,
      modeUsesBt: true,
      chosenRadio: "internet",
    });
    expect(r).toEqual({ bt: true, ws: false });
  });
});
