// =====================================================================
// transports/linkManagerHooks — transport registration for LinkManager.
//
// The manager is deliberately plain TypeScript (no React) so its rules —
// one active link, F-16 bounded connect — are testable in the node vitest
// environment. This file is where React-side wiring would meet it.
//
// F-12 compliance, should any of it come back: the picker must read
// connection state from the manager on every render and NEVER cache it in
// local component state. A cached copy goes stale the moment the link
// changes underneath it (which is exactly how the previous unified
// connection card produced stale status).
//
// WHAT WAS REMOVED HERE, AND WHY (2026-10-06 cleanup).
// This file used to export six hooks: useActiveTransport, useTransportList,
// useSelectedTransport, useActiveTelemetry, useActivateTransport and
// __resetRegistrationForTests. All six had ZERO imports anywhere in src —
// not one screen used them, and no test used the "test-only" reset either.
// Three comments elsewhere (ToolsScreen.tsx, useControlHub.ts,
// linkManager.ts) nonetheless described screens as *using* useActiveTransport
// and useTransportList, which is how six dead hooks sat here looking load-
// bearing for so long. Those comments were corrected in the same pass.
//
// They are recoverable from git if a screen ever genuinely needs them.
// What remains is one registration shim. Since U-109 (2026-10-14) NOTHING in
// `src` imports this file: the Control Panel's live connection UI is
// `connection/methods.ts`, and `useControlHub` no longer wires the LinkManager
// (see the note at the top of that hook). `ensureTransportsRegistered()` is
// therefore reached by no production path; the adapters stay covered by
// `adapters.test.ts`, which calls `registerAllTransports()` directly. Kept —
// filename and all — as the documented roadmap registration point for the day a
// transport picker returns, not as a load-bearing module.
// =====================================================================
import { registerAllTransports } from "./adapters";

let registered = false;

/** Idempotent: builds the adapters the first time a screen asks for them. */
export function ensureTransportsRegistered(): void {
  if (registered) return;
  registered = true;
  registerAllTransports();
}
