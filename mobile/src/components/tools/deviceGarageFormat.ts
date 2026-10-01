// =====================================================================
// deviceGarageFormat - the pure text helpers behind the garage card.
//
// Extracted out of DeviceGarageCard.tsx on purpose. The vitest config is
// `environment: "node"` with `include: ["src/**/*.test.ts"]`, and this repo
// has no react-native testing library, so a test that imported the component
// would drag react-native, NativeWind and @expo/vector-icons into a Node
// process. Keeping the logic in a plain .ts module is what makes it testable
// at all without adding dev dependencies to the release dependency tree.
//
// "now" is an injectable parameter rather than a Date.now() call inside, so
// the boundaries below are testable instead of only reachable by waiting.
// =====================================================================

/**
 * Human "last seen" text for a device.
 *
 * A device clock and a phone clock disagree, so a last-seen timestamp can be
 * in the FUTURE. That is not an error and must never render as a negative
 * age, so future and present both collapse to "Seen just now".
 *
 * Returns "Not seen yet" for null, empty, or unparseable input rather than
 * "Invalid Date" or "NaN min ago" - a unit that has never checked in is a
 * normal state, not a broken one (F-53: never print a value no code path can
 * supply).
 */
export function relativeTime(
  iso: string | null,
  now: number = Date.now(),
): string {
  if (!iso) return "Not seen yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not seen yet";

  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "Seen just now";
  if (mins < 60) return `Seen ${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Seen ${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `Seen ${days} d ago`;

  // Past 30 days an exact count stops being useful. `new Date(iso)` is
  // re-parsed rather than reusing a Date, but that is the only branch that
  // needs the original string for locale formatting.
  return `Seen ${new Date(iso).toLocaleDateString()}`;
}
