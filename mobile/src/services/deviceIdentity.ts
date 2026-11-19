// =====================================================================
// deviceIdentity — ONE entry per physical car, not per profile row.
//
// Owner (2026-11-19, Phase 6): "each car should be treated as a unique
// device", "the cars should be uniquely identified and organized and
// standard in the viewing", and the admin Users tab duplicated the same car
// under several rows.
//
// A car can legitimately own more than one `car_profiles` row: the app keys
// a profile by `fw:<board id>` once firmware reports it, but earlier
// sessions wrote the Bluetooth MAC or a `wifi:` identity, and the same car
// can appear under more than one of those keys. The firmware's board id is
// the ONLY stable hardware identity, so it is the grouping key; rows without
// one fall back to their own profile key (they cannot be proven to be the
// same car, and guessing would merge two cars).
//
// Pure and dependency-free on purpose: the admin screen is a 7k-line TSX
// component and the vitest environment is Node, so the logic that decides
// "same car" must live where a test can reach it.
// =====================================================================

/** The minimum a profile row must expose to be grouped. */
export type IdentifiableProfile = {
  profileKey: string;
  carName: string;
  uniqueId: string;
  settings: Record<string, unknown>;
  updatedAt: string;
};

export type DeviceGroup<P extends IdentifiableProfile = IdentifiableProfile> = {
  /** `uniqueId` when known, else the profile key — stable across re-reads. */
  deviceKey: string;
  /** The board id, or null when this car has never reported one. */
  uniqueId: string | null;
  /** Canonical project id (`settings.project_id`), or null when unknown. */
  project: string | null;
  /** Display name from the newest profile in the group. */
  name: string;
  /** Every profile key folded into this device (fw:/BT MAC/wifi:). */
  profileKeys: string[];
  /** The newest row (edit target and settings source). */
  newest: P;
  /** All rows in the group, newest first. */
  rows: P[];
};

function projectOf(
  settings: Record<string, unknown> | null | undefined,
): string | null {
  const value = settings?.project_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timeOf(iso: string): number {
  const ms = Date.parse(iso || "");
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Collapse profile rows into one group per physical device, newest first.
 *
 * Ordering: newest `updatedAt` first (the same newest-first rule the
 * registry list uses), then device key — deterministic so two reads of the
 * same data never reorder the admin view.
 */
export function groupProfilesByDevice<P extends IdentifiableProfile>(
  profiles: P[],
): DeviceGroup<P>[] {
  const byDevice = new Map<string, P[]>();
  for (const profile of profiles) {
    const uniqueId = (profile.uniqueId || "").trim();
    const key = uniqueId ? `fw:${uniqueId}` : profile.profileKey;
    if (!key) continue;
    const list = byDevice.get(key) ?? [];
    list.push(profile);
    byDevice.set(key, list);
  }

  const groups: DeviceGroup<P>[] = [];
  for (const [deviceKey, rows] of byDevice) {
    const sorted = [...rows].sort(
      (a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt),
    );
    const newest = sorted[0]!;
    // The project can live on any row (the newest write may predate the
    // firmware that reported FW_PROJECT), so take the first non-empty.
    const project =
      sorted.map((row) => projectOf(row.settings)).find((p) => p) ?? null;
    groups.push({
      deviceKey,
      uniqueId: deviceKey.startsWith("fw:") ? deviceKey.slice(3) : null,
      project,
      name: newest.carName || newest.profileKey || deviceKey,
      profileKeys: Array.from(
        new Set(sorted.map((row) => row.profileKey)),
      ).sort(),
      newest,
      rows: sorted,
    });
  }

  return groups.sort(
    (a, b) =>
      timeOf(b.newest.updatedAt) - timeOf(a.newest.updatedAt) ||
      a.deviceKey.localeCompare(b.deviceKey),
  );
}
