// =====================================================================
// toolsScreenFlow — pure logic for the Control Panel screen.
//
// 1. queueDeckOpen — the "Open deck" debounce (2026-10-02 audit, UX-2): the
//    old code created its timer INSIDE the onPress callback and returned the
//    cleanup from that same callback — React runs that cleanup immediately,
//    cancelling the timer the moment onPress returns. On some React Native
//    versions the tap then silently did nothing: the "Open … deck" button
//    was a dead end on the first press. queueDeckOpen is the corrected
//    scheduler: it cancels a PREVIOUS timer (double-tap lands one
//    navigation), and its cancel function is returned to the CALLER to
//    store — never consumed by the same tick that queued the work. Pinned
//    by toolsScreenFlow.test.ts with fake timers.
//
// 2. resolveBtConnectDevice — the BT connect dial (2026-10-02 audit, OPS-3):
//    the screen-level scan list is mutable state that a method switch does
//    NOT clear, so after BT → Car-AP → BT a re-pick could resolve the
//    connect against a STALE row from the earlier session — most visibly a
//    MAC-shaped fallback name recorded when an old scan could not resolve
//    the device name (silent: the connect worked, the label lied). The name
//    that rides along with the CURRENT connect request is the row the user
//    tapped THIS time and always outranks it (F-59 rule 2: read last-tapped
//    truth only). F-40's rule is preserved in full: a lost row NEVER fails
//    the connect — the direct-MAC fallback still dials.
// =====================================================================
import type { SppDevice } from "../../services/sppService";

export const DECK_OPEN_DEBOUNCE_MS = 150;

/**
 * Queue `push` to run after the debounce window. Pass a previous cancel
 * function to replace an in-flight timer (double-tap safety). Returns the
 * cancel function for the NEW timer — the component stores it (in a ref or
 * state) and must NOT invoke it synchronously.
 */
export function queueDeckOpen(
  previousCancel: (() => void) | null,
  push: () => void,
  timerMs: number = DECK_OPEN_DEBOUNCE_MS,
): () => void {
  previousCancel?.();
  const id = setTimeout(push, timerMs);
  return () => clearTimeout(id);
}

/**
 * Build the SppDevice a BT-classic connect dials with.
 *
 * `request` is what the user JUST tapped (address + the name that rode
 * along with the picker's connect request). `screenRows` is the hub's
 * screen-level scan list — consulted only to fill gaps, never to relabel:
 * it survives a method switch un-cleared, so a hit there can be a row from
 * an earlier session with a stale name (OPS-3). The F-40 contract holds:
 * an empty/missing row never throws — the direct-MAC fallback dials and
 * lets sppService.connect() validate + bond like the legacy path always did.
 */
export function resolveBtConnectDevice(
  request: { address: string; name?: string | null },
  screenRows: ReadonlyArray<SppDevice>,
): SppDevice {
  const scanned = screenRows.find((d) => d.address === request.address) ?? null;
  // Fresh request name → screen row name → the MAC. The request name wins
  // even when a screen row exists: the row may predate a rename.
  const name = request.name || scanned?.name || request.address;
  if (scanned) return { ...scanned, name };
  return {
    id: request.address,
    name,
    address: request.address,
    bonded: true,
  };
}
