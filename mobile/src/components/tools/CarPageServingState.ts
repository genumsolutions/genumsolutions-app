// =====================================================================
// U-120: the HUB's public page-serving opinion.
//
// This is the ONLY page-ON truth screen code should derive the Remote chip
// from. Every other path that reaches the car's page (HEAD/GET, on-the-wire
// `;PAGE=`/`page_on` detection, wifiUrl) is a SEPARATE concern and does NOT
// feed this one — that gate is claimed and verified on its own terms.
//
// Shape: { current, old, changeFlag } — current = what the HUB thinks the
// car is serving RIGHT NOW; old = the last steady frame's current (so change
// consumers can tell ON→OFF from OFF→ON without re-deriving the delta); changeFlag
// = current !== old AND a real change happened since the last steady frame.
// =====================================================================
export interface CarPageServingState {
  current: boolean;
  old: boolean;
  changeFlag: boolean;
}

export function isCarPageReachable(
  pageServing: CarPageServingState | null | undefined,
  wifiEnabled: boolean | null | undefined,
): boolean {
  return pageServing?.current === true && wifiEnabled !== false;
}
