// =====================================================================
// commandRouting — the sendCommand routing decision, extracted PURE.
//
// History: R-4 fleet parity routes non-broadcast lines by the ACTIVE
// MODE's transport ("a Bluetooth car must never hear a WiFi-mode drive
// letter"), and when exactly ONE link is live it is used regardless of
// mode (so a 4WD4M connected purely over the car's WS still drives).
//
// The gap this closes (owner bench report 2026-10-02 evening, item ④b):
// when TWO links were live, mode parity was the ONLY rule — so a
// BT-transport mode with a stale BT link plus a live home-router (STA)
// WebSocket sent drive letters over BT only. The phone sat on the
// router, the car never moved, and the deck looked alive while being
// deaf.
//
// The rule (R-4 extension): mode parity still decides which radios MAY
// carry a command, but the user's CHOSEN method — the LinkManager's
// active link — is the tie-breaker when two links are live. The link
// the user deliberately picked always carries the command, so a stale
// secondary link can never strand it.
//
// Pinned by commandRouting.test.ts.
// =====================================================================

/** The LinkManager's active-transport radio, or null when unknown. */
export type ChosenRadio = "bluetooth" | "wifi" | "internet" | null;

export type CommandRouteInput = {
  /** Every-link command (mode tokens + neutral/emergency lines)? */
  broadcast: boolean;
  /** A BT link (SPP or BLE) is live. */
  btLive: boolean;
  /** The WiFi WebSocket is live. */
  wsLive: boolean;
  /** The active mode lists a BT transport (classic-bt or ble). */
  modeUsesBt: boolean;
  /** The active mode lists a WiFi transport. */
  modeUsesWifi: boolean;
  /** The radio of the link the USER chose (manager truth), if known. */
  chosenRadio: ChosenRadio;
};

/** Where a single command should go. */
export type CommandRoute = { bt: boolean; ws: boolean };

export function routeCommand(input: CommandRouteInput): CommandRoute {
  const { broadcast, btLive, wsLive, modeUsesBt, modeUsesWifi, chosenRadio } =
    input;

  // System/emergency lines reach the car over WHATEVER is live.
  if (broadcast) return { bt: btLive, ws: wsLive };

  // One live link wins outright, whatever the mode says (the 4WD4M-over-WS
  // path; also the reason a single-link bench session always drives).
  if (btLive && !wsLive) return { bt: true, ws: false };
  if (wsLive && !btLive) return { bt: false, ws: true };

  // Both live: mode parity decides, and the user's chosen method is the
  // tie-breaker — the chosen link ALWAYS carries the command.
  return {
    bt: modeUsesBt || chosenRadio === "bluetooth",
    ws: modeUsesWifi || chosenRadio === "wifi",
  };
}
