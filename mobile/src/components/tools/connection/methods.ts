// =====================================================================
// connection/methods — THE THREE METHODS (U-68 rebuild, 2026-10-02).
//
// Owner directive, verbatim: *"please keep only these method for now,
// Bluwtooth, Wifi(LAN), Internet"* and *"offer bluetooh comminication with
// SPP only for now. Wifi LAN with the esp32 hotspot and the n allowing to
// switch to other router for the wifi lan by connectin the app to the
// projects own hotspot like the esp32 has and then allowing to switch the
// router and keep all the router data nd things in proper state"*.
//
// This module is the single declaration of what can be connected to. It is
// pure data + pure predicates: no I/O, no React, no services. A screen may
// not invent a fourth method, and may not offer a target this file does not
// declare — that is the whole point (F-67: options the user chooses between
// must come from one list, or they are not comparable).
//
// A "target" is a concrete thing to connect to. Three methods, three
// targets, and they are NOT three transports:
//
//   bluetooth → bt-spp        the car, by MAC from a scan. SPP only: BLE is
//                              not offered at all (no BLE server exists in
//                              the car firmware, and a row that cannot work
//                              is worse than no row).
//   wifi      → car-hotspot   the network the ESP32 itself broadcasts. This
//                              is the PROVISIONING surface — it is where you
//                              add and switch the car's router.
//              → home-router   the car, once it has joined your router,
//                              dialled ONLY at the address the car reports.
//   internet  → (none)        offered honestly as unavailable. There is no
//                              broker and no relay (see guide/PLAN-2026-10-02
//                              -CONTROL-PANEL-CONNECTION-REBUILD.md). It
//                              must never appear to work.
//
// Pinned by methods.test.ts.
// =====================================================================

/** The three methods, exactly. */
export type ConnectionMethodId = "bluetooth" | "wifi" | "internet";

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
  /**
   * Set when the whole method cannot work on this build. The UI shows the
   * reason instead of a connect button — honest, and it leaves the door open
   * for the relay that does not exist yet.
   */
  readonly unavailable?: string;
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
    blurb: "",
    targets: [CAR_WIFI],
  },
  {
    id: "internet",
    label: "Internet",
    blurb: "",
    unavailable: "Not available yet.",
    targets: [],
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
 * A method-level `unavailable` beats everything (Internet). Then the target's
 * own precondition: `home-router` is unusable until the car reports an
 * address that is not its own hotspot. The UI must render THIS string rather
 * than offering a button that would dial a guess (F-65, and the D4 defect
 * this replaces).
 */
export function targetUnavailableReason(
  id: ConnectionTargetId | null | undefined,
  ctx: { carOnOwnRouter: boolean },
): string | null {
  const method = getMethod(methodOfTarget(id));
  if (!method) return "That connection method no longer exists.";
  if (method.unavailable) return method.unavailable;
  const target = getTarget(id);
  if (!target) return "That connection method no longer exists.";
  if (target.needsCarOnRouter && !ctx.carOnOwnRouter) {
    return (
      "The car has not joined your router yet. Switch it from the car's own " +
      "hotspot first — then its address appears here."
    );
  }
  return null;
}
