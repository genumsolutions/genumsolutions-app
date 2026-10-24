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
  /**
   * U-124 ② (owner 2026-10-24): NetInfo's subnet ("192.168.245.0/24"). The
   * OS withholds the SSID until the app holds the location permission; the
   * subnet is the fact that is ALWAYS there and the one that actually decides
   * whether this phone can reach the car (its own hotspot is a /24 no router
   * uses), so it is the honest stand-in while the name is being asked for.
   */
  readonly subnet?: string | null;
};

/** The label the panel shows. Never empty — every state has honest copy. */
export function formatPhoneNetwork(input: PhoneNetworkInput): string {
  if (!input.connected || input.type === "none") return "No network";
  if (input.type === "wifi") {
    const ssid = input.ssid?.trim() || "";
    if (ssid) return `Wi-Fi · ${ssid}`;
    // The OS is withholding the name (permission not yet granted, or location
    // services off). "name hidden" was the old answer — the owner: *"shows the
    // wifi. name hidden, which is meaningless and should show the wifi network
    // the app is connected to"*. The hub now ASKS for the permission so the
    // real name lands; until the OS answers, the subnet names the network the
    // phone actually sits on instead of printing a non-answer.
    const subnet = input.subnet?.trim() || "";
    return subnet ? `Wi-Fi · ${subnet}` : "Wi-Fi · name not shared";
  }
  if (input.type === "cellular") return "Cellular";
  return input.type ? `Other · ${input.type}` : "Unknown network";
}
