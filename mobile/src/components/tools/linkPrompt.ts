// =====================================================================
// P1 (owner 2026-10-17) — ONE prompt-state decision for the Remote screen.
// U-118 (owner 2026-10-20) — "the reconnect shows the last reset thing,
// remove that."
//
// Before this module the deck carried TWO independent prompts whose visibility
// was decided in two different places by two different flags:
//
//   * renderReconnectBanner()  — gated on `showSppsRetry && !linked`
//   * renderRestartBanner()    — gated on `carRestartNotice != null`
//
// P1 made this module the single owner of that question, and U-118 narrows it
// to ONE card: RECONNECT. The old `restart` card was the only place the
// last-reset record (boot count · reset reason · crash count) was painted on
// the deck, and the owner asked for it to be removed from the reconnect
// surface. The record itself is untouched — it still leads the Control Panel's
// "Last restart record" (P2, ToolsScreen), which is where an owner acts on it.
//
// A detected restart still MATTERS here, but only as the CAUSE of the dropped
// link: it may raise the reconnect card earlier (the car rebooted and no link
// is up — the prompt is a true claim about NOW) and it swaps in one plain
// sentence. No numbers, no reset reason, no crash count ever reach this card.
//
// It remains PURE — it takes the live link facts and returns the ONE prompt
// the screen should show, or null. When the fact that raised a prompt clears,
// the next call returns null (F-85: a prompt is a claim about the PRESENT).
// =====================================================================

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
};

export type LinkPromptArgs = {
  /** Any real link is up (the screen's `connected || wifiConnected`). */
  readonly linked: boolean;
  /** Bluetooth's own truth (SPP or BLE). Feeds the copy, not the gate. */
  readonly btLinked: boolean;
  /** Wi-Fi/WebSocket truth. Feeds the copy, not the gate. */
  readonly wifiConnected: boolean;
  /** The SPP auto-reconnect backoff has exhausted. */
  readonly sppRetryDue: boolean;
  /** The detected restart, or null. Cause only — its RECORD is never shown. */
  readonly restart: LinkPromptRestart | null;
  /** Human transport label ("BT+WiFi" / "Bluetooth" / "WiFi" / "Offline"). */
  readonly linkLabel: string;
  /** The IP to show beside a live link, or null. */
  readonly ipText: string | null;
};

/** Base copy: the honest state of a link that is down with no fallback. */
const RECONNECT_BODY =
  "The Bluetooth link to your car dropped, and no Wi-Fi link is up either. " +
  "The car is stopping itself on link loss. Reconnect?";

/** Cause copy when the car rebooted — a sentence, never the reset RECORD. */
const RESTART_CAUSE_BODY =
  "Your car restarted and the Bluetooth link dropped, with no Wi-Fi link " +
  "up either. The car is stopping itself on link loss. Reconnect?";

/**
 * The ONE decision: which prompt belongs on screen right now, given the live
 * link facts. Returns null when nothing should be shown.
 *
 * Gate: a link is DOWN (never while one is up) AND the user has a true reason
 * — the auto-reconnect backoff is exhausted, OR the car rebooted (which is
 * itself why the link died).
 */
export function resolveLinkPrompt(args: LinkPromptArgs): LinkPrompt | null {
  if (!args.linked && (args.sppRetryDue || args.restart != null)) {
    return {
      kind: "reconnect",
      tone: "amber",
      title: "Bluetooth disconnected",
      body: args.restart != null ? RESTART_CAUSE_BODY : RECONNECT_BODY,
    };
  }
  return null;
}
