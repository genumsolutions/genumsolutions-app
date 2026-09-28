// =====================================================================
// transports/linkManagerHooks — React bindings for LinkManager.
//
// The manager is deliberately plain TypeScript (no React) so its rules —
// one active link, F-16 bounded connect — are testable in the node vitest
// environment. This file is the only place React meets it.
//
// F-12 compliance: the picker reads connection state from the manager on
// every render and NEVER caches it in local component state. A cached copy
// goes stale the moment the link changes underneath it (which is exactly
// how the previous unified connection card produced stale status).
// =====================================================================
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { linkManager, type ActiveLinkState } from "./linkManager";
import { registerAllTransports } from "./adapters";
import type { Transport, TransportId } from "./types";

let registered = false;

/** Idempotent: builds the adapters the first time a screen asks for them. */
export function ensureTransportsRegistered(): void {
  if (registered) return;
  registered = true;
  registerAllTransports();
}

/** @internal test-only. */
export function __resetRegistrationForTests(): void {
  registered = false;
}

function subscribe(cb: () => void): () => void {
  return linkManager.subscribe(cb);
}

function getSnapshot(): ActiveLinkState {
  return linkManager.getState();
}

/** The current link state; re-renders on every change. */
export function useActiveTransport(): ActiveLinkState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Every selectable transport, in picker order. */
export function useTransportList(): Transport[] {
  ensureTransportsRegistered();
  const state = useActiveTransport(); // re-render on link changes
  // `state` is a dependency purely to re-render the list when links change;
  // the list itself is static once registered.
  void state;
  return linkManager.list();
}

/** The transport the user selected, or null. */
export function useSelectedTransport(): Transport | null {
  const { id } = useActiveTransport();
  return id ? (linkManager.get(id) ?? null) : null;
}

/** Subscribe to telemetry from whichever link is active. */
export function useActiveTelemetry(onFrame: (t: unknown) => void): void {
  const handler = useCallback((t: unknown) => onFrame(t), [onFrame]);
  useEffect(() => linkManager.onTelemetry(handler), [handler]);
}

/** Select a transport and bring it up, tearing the previous one down. */
export function useActivateTransport(): (
  id: TransportId,
  options?: Parameters<typeof linkManager.activate>[1],
) => Promise<void> {
  return useCallback(
    (id, options) => linkManager.activate(id, options).then(() => undefined),
    [],
  );
}
