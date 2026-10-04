// U-90 (2026-10-04): the app's ONE responsive idiom.
//
// Before this module every screen derived its own layout facts:
// RouterPanel had `isWide = width >= 640`, RemoteControlScreen had
// `isLandscape = width > height`, AccountSheet/ModeChooser each called
// useWindowDimensions themselves, and HomeScreen froze its card width at
// MODULE LOAD (`Dimensions.get("window")` at import time — after a rotation,
// on a tablet, or on the web build after any window resize, the home strips
// kept portrait-width cards and snapped to the wrong interval forever; the
// app ships `"orientation": "default"` and a web build, so both happen).
//
// One hook, one breakpoint, one landscape rule. `useWindowDimensions` is the
// reactive primitive (re-renders on rotation/fold/resize); everything here
// is derived from it so a consumer can never mix a live value with a frozen
// one. FloatingRemoteButton deliberately keeps its own drag-time
// Dimensions.get reads (event-time reads avoid re-render churn mid-drag, and
// that component is device-proven) — do not "migrate" it onto this hook.
import { useWindowDimensions } from "react-native";

/**
 * The single layout breakpoint. 640 is Tailwind's `sm`, which is what
 * RouterPanel already used — keeping it means no screen changes size today;
 * this module only makes the threshold shared and pinned by test.
 */
export const WIDE_BREAKPOINT = 640;

/** Two-column / side-by-side layouts unlock at and above this width. */
export function isWideLayout(width: number): boolean {
  return width >= WIDE_BREAKPOINT;
}

/** Landscape means strictly wider than tall (square counts as portrait). */
export function isLandscapeLayout(width: number, height: number): boolean {
  return width > height;
}

// ---- Home strips (U-47v5 rule, made reactive here in U-90) ---------------
// The home shelves show TWO ProductCards per viewport width, like the
// website's shelves: horizontal padding of 20 on each side and ONE 12 gap
// between the two visible cards.
export const HOME_STRIP_PADDING_X = 20;
export const HOME_CARD_GAP = 12;

/** Width of one home-strip card for the given viewport width. */
export function homeCardWidth(viewportWidth: number): number {
  return (viewportWidth - HOME_STRIP_PADDING_X * 2 - HOME_CARD_GAP) / 2;
}

export interface Viewport {
  width: number;
  height: number;
  isLandscape: boolean;
  isWide: boolean;
}

/**
 * The one hook for layout-reactive values. Every consumer gets the same
 * live width/height plus the shared landscape/wide derivations — no screen
 * computes its own threshold any more.
 */
export function useViewport(): Viewport {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isLandscape: isLandscapeLayout(width, height),
    isWide: isWideLayout(width),
  };
}
