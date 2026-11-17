// =====================================================================
// P1 — ONE prompt-state decision for the Remote screen.
// U-118 (owner 2026-10-20) — "the reconnect shows the last reset thing,
// remove that."
// U-120 Phase C (owner 2026-10-22) — "reconnecting should not be
// automatic, it should prompt the reconnect dialog box with proper
// method and only reconnect if sayed yes and remove other unnecessary
// messages from the reconnect dialog box."
//
// Before this module the deck carried TWO independent prompts whose
// visibility was decided in two different places by two different flags:
//
//   * renderReconnectBanner()  — gated on `showSppsRetry && !linked`
//   * renderRestartBanner()    — gated on `carRestartNotice != null`
//
// P1 made this module the single owner of that question, U-118 narrows it
// to ONE card: RECONNECT, and U-120 makes that card the ONLY recovery
// path — no transport reconnects on its own anymore (the Wi-Fi quiet
// re-dial and the SPP silent backoff are both gone). The card names the
// METHOD that dropped (title + body), asks one yes/no question, and the
// screen routes Reconnect through that method. Carries nothing else: no
// reset record (U-118), no "stopping itself on link loss" narration, no
// last-reset numbers — one title, one sentence, two buttons.
//
// A detected restart may explain an unexpected drop and swaps in one plain
// sentence, but it never raises a prompt on its own. This keeps an old restart
// notice from reopening the dialog after a user-initiated disconnect.
//
// It remains PURE — it takes the live link facts and returns the ONE prompt
// the screen should show, or null. When the fact that raised a prompt clears,
// the next call returns null (F-85: a prompt is a claim about the PRESENT).
// =====================================================================

/** Which transport dropped — the method the dialog names and reconnects over. */
export type LinkPromptMethod = "Bluetooth" | "Wi-Fi";

/** The car-restart facts the hub raises on a boot-count increase. */
export type LinkPromptRestart = {
  prevBoot: number | null;
  boot: number;
  crashCount: number | null;
  resetReason: string | null;
};

export type LinkPrompt = {
  readonly kind: "reconnect";
  readonly tone: "amber";
  readonly title: string;
  readonly body: string;
  /** The method Reconnect must use (the screen routes on it). */
  readonly method: LinkPromptMethod;
};

export type LinkPromptArgs = {
  /** Any real link is up (the screen's `connected || wifiConnected`). */
  readonly linked: boolean;
  /** Bluetooth's own truth (SPP or BLE). Feeds the copy, not the gate. */
  readonly btLinked: boolean;
  /** Wi-Fi/WebSocket truth. Feeds the copy, not the gate. */
  readonly wifiConnected: boolean;
  /**
   * An unexpected drop is awaiting the user's yes/no (no auto-reconnect
   * runs behind it — U-120).
   */
  readonly reconnectDue: boolean;
  /** The method that dropped: what the title names and Reconnect dials. */
  readonly method: LinkPromptMethod;
  /** The detected restart, or null. Cause only — its RECORD is never shown. */
  readonly restart: LinkPromptRestart | null;
  /** Human transport label ("BT+WiFi" / "Bluetooth" / "WiFi" / "Offline"). */
  readonly linkLabel: string;
  /** The IP to show beside a live link, or null. */
  readonly ipText: string | null;
};

/** The one question the card asks — the method is the only detail kept. */
const RECONNECT_BODY = (method: LinkPromptMethod) =>
  `The ${method} link is down, so controls are paused. Check the car is powered on and nearby. Reconnect makes one attempt; if the car is still starting, wait a moment before trying again.`;

/** Cause copy when the car rebooted — a sentence, never the reset RECORD. */
const RESTART_CAUSE_BODY = (method: LinkPromptMethod) =>
  `Your car restarted and the ${method} link is down. Wait for startup to finish, then tap Reconnect for one attempt or Cancel to stay disconnected.`;

/**
 * The ONE decision: which prompt belongs on screen right now, given the live
 * link facts. Returns null when nothing should be shown.
 *
 * Gate: a link is DOWN (never while one is up) AND an unexpected disconnect
 * awaits the user's yes/no. A restart notice only changes the copy.
 */
export function resolveLinkPrompt(args: LinkPromptArgs): LinkPrompt | null {
  if (!args.linked && args.reconnectDue) {
    return {
      kind: "reconnect",
      tone: "amber",
      title: `${args.method} disconnected`,
      body:
        args.restart != null
          ? RESTART_CAUSE_BODY(args.method)
          : RECONNECT_BODY(args.method),
      method: args.method,
    };
  }
  return null;
}
