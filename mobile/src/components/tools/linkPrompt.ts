// =====================================================================
// P1 (owner 2026-10-17) — ONE prompt-state decision for the Remote screen.
//
// Before this module the deck carried TWO independent prompts whose visibility
// was decided in two different places by two different flags:
//
//   * renderReconnectBanner()  — gated on `showSppsRetry && !linked`
//   * renderRestartBanner()    — gated on `carRestartNotice != null`
//
// Nothing owned the question "which prompt, if any, belongs on screen right
// now?", so the two could stack, the restart card could keep offering a third
// action ("Leave"), and the "is the car really gone?" claim lived in the same
// expression that flipped between a live and dead link.
//
// This module is that single owner. It is PURE — it takes the live link facts
// and returns the ONE prompt the screen should show, or null. The screen no
// longer decides; it only renders what this returns. That makes the decision
// testable without a renderer and makes stale prompts impossible to keep by
// accident: when the fact that raised a prompt clears, the next call returns
// null (F-85: a prompt is a claim about the PRESENT).
//
// Precedence, deliberately:
//   1. A detected car RESTART wins — it NAMES the cause of a dropped link and
//      is the only place the reset reason / crash count are surfaced. It is
//      informational and can be shown while a link is live (the boot count
//      only rises on a real restart, observed over a working link).
//   2. The RECONNECT prompt is a claim that the car is NOT answering, so it may
//      only be raised when the auto-reconnect backoff is exhausted AND no link
//      of any kind is up. A live link retires it (the screen also arms a
//      state-clearing effect for the underlying flag).
// =====================================================================

/** The car-restart facts the hub raises on a boot-count increase. */
export type LinkPromptRestart = {
  prevBoot: number | null;
  boot: number;
  crashCount: number | null;
  resetReason: string | null;
};

export type LinkPrompt =
  | {
      readonly kind: "restart";
      readonly tone: "sky";
      readonly title: string;
      /** "Boot 4 → 5 · reset TASK_WDT · 3 crashes" */
      readonly bootLine: string;
      /** "Link now: BT+WiFi · 192.168.245.10" */
      readonly linkLine: string;
    }
  | {
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
  /** The detected restart, or null. */
  readonly restart: LinkPromptRestart | null;
  /** Human transport label ("BT+WiFi" / "Bluetooth" / "WiFi" / "Offline"). */
  readonly linkLabel: string;
  /** The IP to show beside a live link, or null. */
  readonly ipText: string | null;
};

/** Build the restart card's one-line boot summary. Exported for tests. */
export function formatBootLine(restart: LinkPromptRestart): string {
  const reason = restart.resetReason?.trim() || "unknown";
  const crashes =
    restart.crashCount != null
      ? `${restart.crashCount} crash${restart.crashCount === 1 ? "" : "es"}`
      : null;
  const boot =
    restart.prevBoot != null
      ? `Boot ${restart.prevBoot} → ${restart.boot}`
      : `Boot ${restart.boot}`;
  return [boot, `reset ${reason}`, crashes].filter(Boolean).join(" · ");
}

/**
 * The ONE decision: which prompt belongs on screen right now, given the live
 * link facts. Returns null when nothing should be shown.
 */
export function resolveLinkPrompt(args: LinkPromptArgs): LinkPrompt | null {
  // 1. A restart names the cause — it outranks the generic reconnect copy.
  if (args.restart) {
    return {
      kind: "restart",
      tone: "sky",
      title: "Car restarted",
      bootLine: formatBootLine(args.restart),
      linkLine:
        `Link now: ${args.linked ? args.linkLabel : "none"}` +
        (args.linked && args.ipText ? ` · ${args.ipText}` : ""),
    };
  }

  // 2. The reconnect prompt asserts the car is gone — only honest when the
  //    backoff is exhausted AND no transport is up. Never while linked.
  if (args.sppRetryDue && !args.linked) {
    return {
      kind: "reconnect",
      tone: "amber",
      title: "Bluetooth disconnected",
      body:
        "The Bluetooth link to your car dropped, and no Wi-Fi link is up either. " +
        "The car is stopping itself on link loss. Reconnect?",
    };
  }

  return null;
}
