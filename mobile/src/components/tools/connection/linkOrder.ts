// =====================================================================
// P3 / owner item A — the SECOND-link raise, described.
//
// Issue A is connect ORDERING + honesty: when one link is already live and
// the app starts the other transport, the user must never read that raise as
// an established fact. What the app has always had (and U-113 P2 verified)
// is per-link truth — neither `handleConnect` nor `handleWifiConnect` flips
// a link flag before it is CONFIRMED (`btLinked` after the native connect
// resolves, `wifiConnected` after the car ANSWERS). So "never claims BT+WiFi
// before both are live" already holds. What was missing is the IN-BETWEEN:
// while the second link is still negotiating, the panel said nothing — one
// shared `connecting` flag with no owner of "WHICH link is coming up" — and
// if the car refused the raise (P4's LINKCAP latch flips to 0 mid-flight),
// the user waited for the native/socket failure instead of the car's honest
// reason.
//
// This module owns that question. It is PURE: it derives the second-link
// state from the live link facts the hub already exposes, with NO new hub
// state and no new persistence:
//
//   * BT  in flight  <=> `connectingAddress != null` (handleConnect's marker:
//                        set at start, cleared on every outcome)
//   * Wi-Fi in flight <=> `connecting && connectingAddress == null`
//                        (handleWifiConnect's shared `connecting` + finally)
//   * the raise IS the second link <=> exactly one link is live
//
// The refusal half is F-88 at the point of use: only a car that REPORTED
// `linkCap === false` while the raise is pending may say "refused". An absent
// or `true` verdict never manufactures a denial — a raise always gets to
// finish and produce its own honest outcome.
// =====================================================================

/** Which transport the app is raising, when the raise is the second one. */
export type SecondLinkRaise = "bluetooth" | "wifi";

export type SecondLinkState = {
  /** The transport currently being raised as the second link, or null. */
  raise: SecondLinkRaise | null;
  /**
   * The one honest in-between line the panel may show, or null. Never a
   * claim about the link being ESTABLISHED — "coming up" while pending,
   * "refused" only on the car's own recorded verdict.
   */
  line: string | null;
  /**
   * True only while a second-link raise is pending AND the car has REPORTED
   * that it refused the second link (`linkCap === false`, strict — an absent
   * field means capable, F-88; the raise must then finish its own failure).
   */
  refusedByCar: boolean;
};

export type SecondLinkFacts = {
  /** Bluetooth is live (BLE or SPP — the hub's per-method truth). */
  btLinked: boolean;
  /** Wi-Fi is live. */
  wifiConnected: boolean;
  /** A connect is in flight on the shared flag (Wi-Fi's marker). */
  connecting: boolean;
  /** Bluetooth's in-flight marker (set at handleConnect start). */
  connectingAddress: string | null;
  /** The car's LINK-CAPACITY verdict; `null` = the car has not said. */
  linkCap: boolean | null;
};

const LABEL: Record<SecondLinkRaise, string> = {
  bluetooth: "Bluetooth",
  wifi: "Wi-Fi",
};

export function describeSecondLink(facts: SecondLinkFacts): SecondLinkState {
  const exactlyOneLive = facts.btLinked !== facts.wifiConnected;

  // Which raise is in flight: Bluetooth via its own marker, Wi-Fi via the
  // shared `connecting` flag (Bluetooth never clears connectingAddress while
  // it is still dialling). With zero or two links live there is no second
  // raise by definition — a once-empty raise is a FIRST raise, and the car
  // never refuses those (P4): the gate must stay silent.
  const raise: SecondLinkRaise | null = !exactlyOneLive
    ? null
    : facts.connectingAddress != null && !facts.btLinked
      ? "bluetooth"
      : facts.connecting && facts.connectingAddress == null
        ? "wifi"
        : null;

  // F-88: only the car's own REPORTED refusal says "refused". A raise with
  // no car verdict, or with an admitted verdict, is just "coming up…".
  const refusedByCar = raise !== null && facts.linkCap === false;

  return {
    raise,
    refusedByCar,
    line:
      raise === null
        ? null
        : refusedByCar
          ? `The car reports low memory and refused ${LABEL[raise]} to prevent a freeze or reset. Keep using the current link, or switch off the other transport in Settings before trying again.`
          : `${LABEL[raise]} coming up…`,
  };
}
