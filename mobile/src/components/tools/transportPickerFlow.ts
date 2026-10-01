// =====================================================================
// transportPickerFlow — pure logic for the confirmed method switch.
//
// Extracted from TransportPicker so CI can pin what the device round
// would otherwise have to notice (the F-53 rule: a policy that only a
// human with hardware can check is unverified).
//
// The bug this module fixes (2026-10-02 audit, OPS-1): the confirmed
// switch dialled the `url` STATE VARIABLE of the method being LEFT —
// a stale closure from the previous render. Switching Car-AP →
// home-router could therefore dial the car's AP address
// (ws://192.168.245.1:81) while the phone sat on the home router: a
// guaranteed connect failure that LOOKED like "the car is broken".
//
// The rule (F-51's "one command means the same thing" applied to
// addresses): every URL-shaped method dials ITS OWN address — the one
// stored for it, else its default. A scan-based method has no address
// at all. planSwitch is pure: same inputs, same dial, no React.
// =====================================================================
import type { TransportId } from "../../transports/types";

import { DEFAULT_AP_IP, DEFAULT_WS_URL } from "../../services/carProtocol";

/** The per-method default dial. One source, shared by the picker. */
export const DEFAULT_URL_BY_METHOD: Partial<Record<TransportId, string>> = {
  "wifi-ap-ws": DEFAULT_WS_URL,
  "wifi-sta-ws": DEFAULT_WS_URL,
  http: `http://${DEFAULT_AP_IP}:80`,
};

/** Methods that dial an address directly (everything else scans or dials blind). */
function isUrlShaped(id: TransportId): boolean {
  return id === "wifi-ap-ws" || id === "wifi-sta-ws" || id === "http";
}

export type SwitchPlan = {
  targetMethodId: TransportId;
  /** The URL to dial, or null when the target has no address (scan-based). */
  url: string | null;
};

/**
 * Resolve what a confirmed switch to `targetMethodId` must dial.
 *
 * `scanBased` is the transport registry's OWN `scan` truth (no hand-written
 * id list here — F-51 rule 2): true means the method shows a device scan and
 * dials nothing itself.
 *
 * Returns null when the target is neither URL-shaped nor scan-based (an
 * unknown id fails closed — it must not dial anything).
 */
export function planSwitch(input: {
  targetMethodId: TransportId;
  urlByTransport: Record<string, string>;
  scanBased?: boolean;
}): SwitchPlan | null {
  const { targetMethodId, urlByTransport, scanBased } = input;
  if (!isUrlShaped(targetMethodId)) {
    if (scanBased) {
      // A scan-based method (Bluetooth) has no address: the picker shows the
      // scan list and the screen's connect path dials the picked device.
      return { targetMethodId, url: null };
    }
    // Unknown id — no plan, no dial (fails closed).
    return null;
  }
  const stored = urlByTransport[targetMethodId]?.trim();
  return {
    targetMethodId,
    url: stored || DEFAULT_URL_BY_METHOD[targetMethodId] || null,
  };
}
