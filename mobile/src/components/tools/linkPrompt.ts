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
// A detected restart still MATTERS here, only as the CAUSE of the dropped
// link: it may raise the reconnect card earlier (the car rebooted and no
// link is up — the prompt is a true claim about NOW) and it swaps in one
// plain sentence.
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
  `Reconnect to your car over ${method}?`;

/** Cause copy when the car rebooted — a sentence, never the reset RECORD. */
const RESTART_CAUSE_BODY = (method: LinkPromptMethod) =>
  `Your car restarted. Reconnect to it over ${method}?`;

/**
 * The ONE decision: which prompt belongs on screen right now, given the live
 * link facts. Returns null when nothing should be shown.
 *
 * Gate: a link is DOWN (never while one is up) AND the user has a true reason
 * — an unexpected drop awaits their yes/no, OR the car rebooted (which is
 * itself why the link died).
 */
export function resolveLinkPrompt(args: LinkPromptArgs): LinkPrompt | null {
  if (!args.linked && (args.reconnectDue || args.restart != null)) {
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
