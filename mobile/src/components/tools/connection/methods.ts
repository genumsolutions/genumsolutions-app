// =====================================================================
// connection/methods — THE TWO METHODS (U-68 rebuild, 2026-10-02;
// Note: quote predates removal
//
// Owner directive, verbatim: *"please keep only these method for now,
// Bluwtooth, Wifi(LAN), Internet"* and *"offer bluetooh comminication with
// SPP only for now. Wifi LAN with the esp32 hotspot and the n allowing to
// switch to other router for the wifi lan by connectin the app to the
// projects own hotspot like the esp32 has and then allowing to switch the
// router and keep all the router data nd things in proper state"*.
//
// NOTE: that quote PREDATES the removal below — it names Internet because at
// the time it was still offered (honestly, as unavailable). On 2026-10-14 the
// owner dropped the Internet/remote-link method entirely; it is gone from this
// model and will be rebuilt from scratch later. The quote is kept as the historical
// record of the original brief, not as the current requirement.
//
// This module is the single declaration of what can be connected to. It is
// pure data + pure predicates: no I/O, no React, no services. A screen may
// not invent a third method, and may not offer a target this file does not
// declare — that is the whole point (F-67: options the user chooses between
// must come from one list, or they are not comparable).
//
// A "target" is a concrete thing to connect to. Two methods, three targets,
// and they are NOT three transports:
//
//   bluetooth → bt-spp        the car, by MAC from a scan. SPP only: BLE is
//                              not offered at all (no BLE server exists in
//                              the car firmware, and a row that cannot work
//                              is worse than no row).
//              → bt-routers    router management over the SAME live SPP link
//                              (U-96): it re-provisions the car's network.
//   wifi      → car-wifi      the car, on whatever network it is on, dialled
//                              ONLY at the address the car reports. This is
//                              also the PROVISIONING surface — it is where you
//                              add and switch the car's router.
//
// Pinned by methods.test.ts.
// =====================================================================

/** The two methods, exactly. */
export type ConnectionMethodId = "bluetooth" | "wifi";

/**
 * U-86: "The car's hotspot" and "Your home router" are gone as separate
 * targets. One Wi-Fi target; the network the car is actually on is read from
 * the car, not chosen here.
 *
 * U-96 (owner): Bluetooth target also supports router management — the user can
 * switch the car's router from the Bluetooth screen too, not just Wi-Fi.
 */
export type ConnectionTargetId = "bt-spp" | "bt-routers" | "car-wifi";

export type ConnectionTarget = {
  readonly id: ConnectionTargetId;
  readonly method: ConnectionMethodId;
  readonly label: string;
  /** One line: what this target IS, in the user's terms. */
  readonly blurb: string;
  /** One line: what the user must do on the phone first. */
  readonly requirement: string;
  /**
   * True when reaching this target changes the CAR's own network.
   *
   * This is the F-65 discriminator and it is load-bearing: a target that
   * re-provisions the device can never be reached by tearing the link down
   * first, because the command that tells the car to switch travels over the
   * very link the teardown destroyed.
   */
  readonly reprovisionsCar: boolean;
  /**
   * True when the car must be reachable before this target means anything.
   * `home-router` is the case that bites: until the car has actually joined a
   * router there is no address to dial, and inventing one is exactly the
   * defect this rebuild removes.
   */
  readonly needsCarOnRouter: boolean;
};

export type ConnectionMethod = {
  readonly id: ConnectionMethodId;
  readonly label: string;
  readonly blurb: string;
  readonly targets: readonly ConnectionTarget[];
};

const BT_SPP: ConnectionTarget = {
  id: "bt-spp",
  method: "bluetooth",
  label: "Connect",
  blurb: "Direct link to the car over Bluetooth Classic.",
  requirement: "Turn on Bluetooth and pick the car from the list.",
  reprovisionsCar: false,
  needsCarOnRouter: false,
};

/**
 * U-96 (owner): the Bluetooth screen also lets you manage the car's routers —
 * switch to a saved router, add a new one, edit/delete. Same capability as the
 * Wi-Fi screen, so the user is not forced to the car's hotspot just to change
 * the router while connected over Bluetooth.
 */
const BT_ROUTERS: ConnectionTarget = {
  id: "bt-routers",
  method: "bluetooth",
  label: "Routers",
  blurb: "Switch the car to a different router, or manage saved routers.",
  requirement: "Car must be connected over Bluetooth first.",
  reprovisionsCar: true,
  needsCarOnRouter: false,
};

/**
 * U-86: ONE Wi-Fi target.
 *
 * There used to be two — "The car's hotspot" and "Your home router" — behind a
 * "Where is the car?" dropdown. The owner called that section dumb and asked
 * for it gone, and it was: the split describes how the phone happens to reach
 * the car, not anything the user chooses. Worse, it showed the literal words
 * "Your home router" even when the car was joined to something else, so the app
 * could not say where the car actually was. The real network name comes from the
 * car's own NETW line and is shown in the one list.
 */
const CAR_WIFI: ConnectionTarget = {
  id: "car-wifi",
  method: "wifi",
  label: "Wi-Fi",
  blurb: "",
  requirement: "",
  reprovisionsCar: false,
  needsCarOnRouter: false,
};

export const CONNECTION_METHODS: readonly ConnectionMethod[] = [
  {
    id: "bluetooth",
    label: "Bluetooth",
    blurb: "Pair with the car directly over Bluetooth Classic.",
    targets: [BT_SPP, BT_ROUTERS],
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    blurb: "Reach the car over Wi-Fi, on whatever network it is on.",
    targets: [CAR_WIFI],
  },
];

export const METHOD_IDS: readonly ConnectionMethodId[] = CONNECTION_METHODS.map(
  (m) => m.id,
);

export function getMethod(
  id: ConnectionMethodId | null | undefined,
): ConnectionMethod | null {
  if (!id) return null;
  return CONNECTION_METHODS.find((m) => m.id === id) ?? null;
}

export function getTarget(
  id: ConnectionTargetId | null | undefined,
): ConnectionTarget | null {
  if (!id) return null;
  for (const m of CONNECTION_METHODS) {
    const t = m.targets.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

export function methodOfTarget(
  id: ConnectionTargetId | null | undefined,
): ConnectionMethodId | null {
  return getTarget(id)?.method ?? null;
}

export function targetsOfMethod(
  id: ConnectionMethodId | null | undefined,
): readonly ConnectionTarget[] {
  return getMethod(id)?.targets ?? [];
}

/**
 * Why a target cannot be used right now, or `null` when it can.
 *
 * The target's own precondition decides: a target that needs the car reachable
 * first is unusable until the car reports an address. The UI must render THIS
 * string rather than offering a button that would dial a guess (F-65, and the
 * D4 defect this replaces).
 *
 * P5 (2026-10-17, owner item F / firmware 1.3.13): `ctx.linkCapRefused` is the
 * car's REPORTED verdict that it cannot host a second link (`;LINKCAP=0` /
 * `"link_cap":0`). When a raise would be the SECOND link, the dial targets
 * return the honest reason instead of offering an action that can only be
 * refused live. The caller only sets this when the raise IS a second raise —
 * the car never refuses its first link, so a first connect must never be gated
 * on it. And the caller only sets it when the car's field is **strictly
 * false**: an ABSENT field means capable (F-88), never denied.
 */
export function targetUnavailableReason(
  id: ConnectionTargetId | null | undefined,
  ctx: { carOnOwnRouter: boolean; linkCapRefused?: boolean },
): string | null {
  const method = getMethod(methodOfTarget(id));
  if (!method) return "That connection method no longer exists.";
  const target = getTarget(id);
  if (!target) return "That connection method no longer exists.";
  if (
    ctx.linkCapRefused &&
    (target.id === "bt-spp" || target.id === "car-wifi")
  ) {
    return (
      "The car has low free memory, so it is allowing one link only to prevent " +
      "a freeze or reset. Keep using the current link, or switch off the other " +
      "transport in Settings before trying again."
    );
  }
  if (target.needsCarOnRouter && !ctx.carOnOwnRouter) {
    return (
      "The car has not joined your router yet. Switch it from the car's own " +
      "hotspot first — then its address appears here."
    );
  }
  return null;
}
