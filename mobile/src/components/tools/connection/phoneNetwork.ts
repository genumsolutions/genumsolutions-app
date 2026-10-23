// =====================================================================
// U-118 (owner 2026-10-20) — "the app is not aware about its own connected
// network."
//
// The hub has tracked the phone's network since U-108 (`phoneSsid`, refreshed
// on every NetInfo event) but NOTHING rendered it — the deck's "on <ssid>"
// chip was removed in U-113 P2 (issue 4, chrome clutter) and no other surface
// took the fact over. So while the car's network is shown in three places,
// the phone's own — the half that decides whether the app can REACH the car —
// was invisible.
//
// This module is the pure label for it, rendered by the Connectivity panel
// (where an owner looks precisely when a link misbehaves), NOT by the deck
// chrome (issue 4 stays honoured). Pure and exported so the rules are proven
// by behaviour with no renderer.
//
// Honesty rules:
//   * "missing" is never invented — an iOS phone that withholds the SSID says
//     so rather than showing a plausible wrong name;
//   * a disconnected phone says "No network" plainly (that is usually the
//     whole answer to "why can't I reach the car?");
//   * cellular is named as cellular — the app cannot sweep a subnet over it.
// =====================================================================

export type PhoneNetworkInput = {
  /** NetInfo `type` ("wifi" | "cellular" | "none" | "unknown" | …). */
  readonly type: string;
  /** NetInfo `isConnected`. */
  readonly connected: boolean;
  /** The Wi-Fi SSID, when the OS reports one. */
  readonly ssid: string | null;
};

/** The label the panel shows. Never empty — every state has honest copy. */
export function formatPhoneNetwork(input: PhoneNetworkInput): string {
  if (!input.connected || input.type === "none") return "No network";
  if (input.type === "wifi") {
    const ssid = input.ssid?.trim() || "";
    // iOS withholds the SSID unless location permission is granted — say the
    // name is hidden rather than printing an empty or guessed network.
    return ssid ? `Wi-Fi · ${ssid}` : "Wi-Fi · name hidden";
  }
  if (input.type === "cellular") return "Cellular";
  return input.type ? `Other · ${input.type}` : "Unknown network";
}
