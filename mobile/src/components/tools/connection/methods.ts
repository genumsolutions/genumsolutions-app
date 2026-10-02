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

/** A concrete connection target inside a method. */
export type ConnectionTargetId = "bt-spp" | "car-hotspot" | "home-router";

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
  label: "Bluetooth",
  blurb: "Direct link to the car over Bluetooth Classic.",
  requirement: "Turn on Bluetooth and pick the car from the list.",
  reprovisionsCar: false,
  needsCarOnRouter: false,
};

const CAR_HOTSPOT: ConnectionTarget = {
  id: "car-hotspot",
  method: "wifi",
  label: "The car's hotspot",
  blurb:
    "The network the car broadcasts itself. Use this to add or switch the " +
    "router the car joins.",
  requirement: "Join the car's Wi-Fi on this phone first.",
  reprovisionsCar: false,
  needsCarOnRouter: false,
};

const HOME_ROUTER: ConnectionTarget = {
  id: "home-router",
  method: "wifi",
  label: "Your home router",
  blurb: "Reaches the car once it has joined your own router.",
  requirement:
    "Switch the car to your router from its hotspot first — this needs an " +
    "address the car reports, never a guessed one.",
  reprovisionsCar: false,
  needsCarOnRouter: true,
};

export const CONNECTION_METHODS: readonly ConnectionMethod[] = [
  {
    id: "bluetooth",
    label: "Bluetooth",
    blurb: "Direct to the car. No router involved.",
    targets: [BT_SPP],
  },
  {
    id: "wifi",
    label: "WiFi (LAN)",
    blurb: "The car's own hotspot, or your router once the car has joined it.",
    targets: [CAR_HOTSPOT, HOME_ROUTER],
  },
  {
    id: "internet",
    label: "Internet",
    blurb: "Reach the car from anywhere, through the cloud.",
    unavailable:
      "Not set up yet. Internet access needs a relay or broker that the " +
      "project connects to, and none is configured.",
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
