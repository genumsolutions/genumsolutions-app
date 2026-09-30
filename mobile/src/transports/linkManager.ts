// =====================================================================
// transports/linkManager — ONE active link, chosen by the user.
//
// The Control Panel used to have no concept of a selected transport at
// all: `sendCommand` in useControlHub reached for Bluetooth first and
// only fell back to the socket (`goBt ?? goWs`), so the app silently chose
// the link. That is why the owner could not select a connection method,
// and why a WiFi-only run was impossible without manually disconnecting
// Bluetooth in another screen first.
//
// This module inverts that: the user picks a transport, the manager
// commits to it, and exactly one link is live at a time. Activating a
// transport tears the others down, so "WiFi selected" genuinely means
// "traffic goes over WiFi".
//
// It is deliberately plain TypeScript with a subscribe() API (no React
// imports) so it can be unit-tested in the node vitest environment; the
// `useActiveTransport` hook in linkManagerHooks.ts binds it to a screen.
// =====================================================================
/* eslint-disable @typescript-eslint/no-require-imports */
import type {
  Transport,
  TransportConnectOptions,
  TransportId,
  TransportStatus,
  TransportStatusEvent,
} from "./types";
import {
  encodeEnvelopeWire,
  type EnvelopeInput,
  type EnvelopeSendResult,
} from "./envelopeWiring";

// AsyncStorage is loaded lazily (safeNative precedent): it is a native
// module, and a static import would make this file un-importable in the
// node vitest environment — which is exactly where the one-active-link and
// F-16 timeout rules most need testing.
type StorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
};
let storageModule: StorageLike | null | undefined;

function getStorage(): StorageLike | null {
  if (storageModule === undefined) {
    try {
      storageModule = require("@react-native-async-storage/async-storage")
        .default as StorageLike;
    } catch {
      storageModule = null;
    }
  }
  return storageModule;
}

/** @internal test-only injection. */
export function __setStorageForTests(mod: StorageLike | null): void {
  storageModule = mod;
}

const STORAGE_KEY = "genum.activeTransport.v1";

/**
 * F-16 guard: "every async operation that changes system state must have a
 * timeout + fallback path — never leave the system in a transitioning state
 * indefinitely." A native Bluetooth connect can hang (and wifiService has
 * its own 8 s socket cap), so the manager bounds the whole attempt and
 * always lands on a definite state: error, never a stuck "connecting".
 *
 * Must exceed BLE_CONNECT_TIMEOUT_MS (10 s) so the BLE path gets to finish
 * on its own and report its real reason.
 */
const CONNECT_TIMEOUT_MS = 20000;

/** The car speaks one command dialect over every link. */
export type CommandSender = (line: string) => Promise<void>;

export type ActiveLinkState = {
  /** The transport the user selected, live or not. null = nothing chosen. */
  id: TransportId | null;
  status: TransportStatus;
  /** Human-readable failure, when status is "error". */
  error: string | null;
  /** True only when a car actually answered on this link. */
  verified: boolean;
};

type Listener = () => void;
type TelemetryListener = (t: unknown) => void;
type StatusListener = (e: TransportStatusEvent) => void;

export class LinkManager {
  private transports = new Map<TransportId, Transport>();
  private activeId: TransportId | null = null;
  private error: string | null = null;
  private verified = false;

  // Options are remembered per transport so switching WiFi AP <-> router
  // (or a second car) does not force the user to retype the address.
  private options = new Map<TransportId, TransportConnectOptions>();

  private stateListeners = new Set<Listener>();
  private telemetryListeners = new Set<TelemetryListener>();
  private statusListeners = new Set<StatusListener>();

  // F-32: stable snapshot handed to useSyncExternalStore (see getState()).
  private cachedState: ActiveLinkState | null = null;

  // Per-transport unsubscribers, torn down when a link stops being active.
  private unsubs: Array<() => void> = [];

  register(transport: Transport): void {
    this.transports.set(transport.id, transport);
  }

  /** Every registered transport, in registration order (picker order). */
  list(): Transport[] {
    return [...this.transports.values()];
  }

  get(id: TransportId): Transport | undefined {
    return this.transports.get(id);
  }

  getActive(): Transport | null {
    return this.activeId ? (this.transports.get(this.activeId) ?? null) : null;
  }

  getState(): ActiveLinkState {
    // MUST return a referentially STABLE object between changes.
    //
    // This is the contract of useSyncExternalStore: React calls getSnapshot()
    // after every render and after every notification, and re-renders whenever
    // the result is not `Object.is`-equal to the last one. Returning a fresh
    // object literal here made every call look like a change, so React
    // re-rendered forever and the Control Panel died with
    // "Maximum update depth exceeded" (shipped in 3.2.7, incident F-32).
    //
    // Correctness does not depend on notification timing: `status` is derived
    // from the transport's live getStatus(), so even a transport that mutated
    // its status without emitting an event is picked up by the cheap field
    // comparison below. emitState() additionally clears the cache, so a normal
    // notify returns the freshly-rebuilt snapshot.
    const active = this.getActive();
    // F-16: a recorded error is TERMINAL for the status. Without this the
    // status keeps deriving "connecting" from a transport whose own connect
    // call hung, and the UI spins on "Connecting…" forever with the real
    // reason sitting in `error` unseen.
    const status: TransportStatus = this.error
      ? "error"
      : active
        ? active.getStatus()
        : "idle";

    const cached = this.cachedState;
    if (
      cached &&
      cached.id === this.activeId &&
      cached.status === status &&
      cached.error === this.error &&
      cached.verified === this.verified
    ) {
      return cached;
    }

    this.cachedState = {
      id: this.activeId,
      status,
      error: this.error,
      verified: this.verified,
    };
    return this.cachedState;
  }

  subscribe = (cb: Listener): (() => void) => {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  };

  onTelemetry = (cb: TelemetryListener): (() => void) => {
    this.telemetryListeners.add(cb);
    return () => this.telemetryListeners.delete(cb);
  };

  onStatus = (cb: StatusListener): (() => void) => {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  };

  private emitState(): void {
    // Any notification may correspond to a real change, so the next getState()
    // must rebuild the snapshot. This keeps it fresh exactly when truth can
    // have changed while staying referentially stable in between.
    this.cachedState = null;
    for (const cb of this.stateListeners) {
      try {
        cb();
      } catch {
        /* a bad listener must not break the others */
      }
    }
  }

  private emitStatus(e: TransportStatusEvent): void {
    for (const cb of this.statusListeners) {
      try {
        cb(e);
      } catch {
        /* ignore */
      }
    }
  }

  private emitTelemetry(t: unknown): void {
    for (const cb of this.telemetryListeners) {
      try {
        cb(t);
      } catch {
        /* ignore */
      }
    }
  }

  private detach(): void {
    for (const off of this.unsubs) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.unsubs = [];
  }

  /**
   * Adopt `transport` as the one live link: tear the previous one down,
   * wire the new one's telemetry/status through, then connect.
   *
   * Disconnecting the old link first is the whole point — it is what makes
   * selecting WiFi actually route traffic over WiFi instead of letting the
   * old Bluetooth preference swallow the commands.
   */
  async activate(
    id: TransportId,
    options: TransportConnectOptions = {},
  ): Promise<void> {
    return this.activateWith(id, options, true);
  }

  /**
   * Record a link that a SIDE-EFFECT owner already brought up, WITHOUT
   * dialing it again. The Control Panel bridge (F-17) connects through the
   * hub handlers (handleConnect / handleWifiConnect) so the legacy services
   * and the hub's authoritative connected/wifiConnected stay the truth;
   * adopt() then tells the manager about the now-live link so the picker's
   * selection, active chip, details and Disconnect capsule agree with
   * reality instead of showing a ghost idle row next to a connected one.
   * Verification still needs a real frame (F-16: transport-up is NOT
   * car-up) — the car's STATE poll delivers it within ~2 s.
   */
  async adopt(
    id: TransportId,
    options: TransportConnectOptions = {},
  ): Promise<void> {
    return this.activateWith(id, options, false);
  }

  private async activateWith(
    id: TransportId,
    options: TransportConnectOptions,
    dial: boolean,
  ): Promise<void> {
    const next = this.transports.get(id);
    if (!next) throw new Error(`Unknown transport: ${id}`);

    if (options && Object.keys(options).length > 0) {
      this.options.set(id, { ...this.options.get(id), ...options });
    }
    const merged = this.options.get(id) ?? {};

    const previous = this.getActive();
    if (previous && previous.id !== id) {
      // Best-effort: a link that fails to close must not block the switch.
      try {
        await previous.disconnect();
      } catch {
        /* ignore */
      }
    }

    this.detach();
    this.activeId = id;
    this.error = null;
    this.verified = false;

    this.unsubs.push(
      next.onTelemetry((t) => {
        // A real frame proves a car is on the far end, not merely that a
        // socket opened. This is the same "transport-up is NOT car-up"
        // distinction wifiService already makes.
        this.verified = true;
        this.emitTelemetry(t);
        this.emitState();
      }),
    );
    this.unsubs.push(
      next.onStatus((e) => {
        if (e.kind === "error") {
          this.error = e.message ?? "Connection failed";
          this.verified = false;
        }
        if (e.kind === "disconnected") {
          this.verified = false;
        }
        this.emitStatus(e);
        this.emitState();
      }),
    );

    this.emitState();
    const storage = getStorage();
    if (storage) {
      void storage.setItem(STORAGE_KEY, id).catch(() => {
        /* persistence is a convenience, never fatal */
      });
    }

    // F-16: bounded connect with a definite fallback state. Without this a
    // hung native connect leaves the picker spinning forever. adopt() skips
    // the dial — the hub handler already brought the link up.
    if (dial) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${next.label} did not finish connecting within ${
                  CONNECT_TIMEOUT_MS / 1000
                }s.`,
              ),
            ),
          CONNECT_TIMEOUT_MS,
        );
      });

      try {
        await Promise.race([next.connect(merged), timeout]);
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.verified = false;
        this.emitState();
        throw e;
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }
    this.emitState();
  }

  /** Drop the active link. The selection is remembered, not erased. */
  async deactivate(): Promise<void> {
    const active = this.getActive();
    this.detach();
    this.activeId = null;
    this.error = null;
    this.verified = false;
    this.emitState();
    if (active) {
      try {
        await active.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * The one way the rest of the app talks to the car. Throws when no link
   * is selected so a command is never silently dropped.
   */
  sendLine = async (line: string): Promise<void> => {
    const active = this.getActive();
    if (!active || !active.isConnected()) {
      throw new Error("No active connection. Select one in the Control Panel.");
    }
    await active.sendLine(line);
  };

  /** Same as sendLine but never throws — for fire-and-forget UI paths. */
  sendSafe: CommandSender = async (line) => {
    try {
      await this.sendLine(line);
    } catch {
      /* the UI already reflects a disconnected link */
    }
  };

  /**
   * Send a JSON command envelope over the active link.
   *
   * The additive front door from Connection-Manager Phase B: friendly
   * JSON in, the EXISTING wire line out, via the same `sendLine` every
   * other command uses — so there is exactly one place a command reaches
   * the transport and exactly one dialect on the wire (F-21/F-23).
   *
   * Two failure modes, both fail CLOSED (nothing is emitted):
   *   • a malformed envelope returns its readable error from the
   *     translation layer, before any I/O;
   *   • a transport failure (no link, socket closed) returns the
   *     manager's own reason.
   *
   * It resolves rather than throws so a caller can render the reason;
   * sendLine keeps throwing for the existing callers that expect it.
   *
   * NOTE: it does not consult the F-41 gate. It is the low-level
   * primitive; the GATE lives at the hub intake, which is the product
   * surface. Keeping them separate is what lets the acceptance round
   * exercise the primitive on the testbed without the shipped UI
   * offering a second dialect.
   */
  sendEnvelope = async (input: EnvelopeInput): Promise<EnvelopeSendResult> => {
    const encoded = encodeEnvelopeWire(input);
    if (!encoded.ok) return { ok: false, error: encoded.error };
    try {
      await this.sendLine(encoded.line);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  /** Fire-and-forget envelope send, for the same UI paths sendSafe covers. */
  sendEnvelopeSafe = async (input: EnvelopeInput): Promise<void> => {
    await this.sendEnvelope(input);
  };

  requestState = async (): Promise<void> => {
    const active = this.getActive();
    if (!active || !active.isConnected()) return;
    try {
      await active.requestState();
    } catch {
      /* ignore */
    }
  };

  /** Restore the previously selected transport id (not a connection). */
  async loadSelection(): Promise<TransportId | null> {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw && this.transports.has(raw as TransportId)) {
        this.activeId = raw as TransportId;
        this.emitState();
        return this.activeId;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

export const linkManager = new LinkManager();
