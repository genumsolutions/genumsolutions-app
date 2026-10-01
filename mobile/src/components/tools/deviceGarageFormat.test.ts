// =====================================================================
// Guards for the garage card's "last seen" text.
//
// The function was extracted from DeviceGarageCard.tsx because that file
// imports react-native, and this repo's vitest runs in a Node environment
// with no react-native testing library - so while the logic lived inside the
// component it was unreachable by any test. Untested boundary maths that
// renders user-facing text is exactly where a defect hides: the original had
// no guard against a FUTURE timestamp, which a car with a wrong RTC clock
// produces routinely.
// =====================================================================
import { describe, expect, it } from "vitest";
import { relativeTime } from "./deviceGarageFormat";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("reports a unit that has never checked in", () => {
    expect(relativeTime(null, NOW)).toBe("Not seen yet");
  });

  it("treats an unparseable timestamp as never-seen, not as an error", () => {
    // A bad string must not reach toLocaleDateString() and render
    // "Invalid Date" at the user.
    expect(relativeTime("not-a-date", NOW)).toBe("Not seen yet");
    expect(relativeTime("", NOW)).toBe("Not seen yet");
  });

  it("collapses anything under a minute to 'just now'", () => {
    expect(relativeTime(ago(0), NOW)).toBe("Seen just now");
    expect(relativeTime(ago(30_000), NOW)).toBe("Seen just now");
    expect(relativeTime(ago(MIN - 1), NOW)).toBe("Seen just now");
  });

  it("switches to minutes at exactly one minute", () => {
    // The boundary is the whole risk: floor() puts 59.999s in the previous
    // bucket, so the first minute label must appear at MIN, not before.
    expect(relativeTime(ago(MIN), NOW)).toBe("Seen 1 min ago");
    expect(relativeTime(ago(MIN * 59), NOW)).toBe("Seen 59 min ago");
  });

  it("switches to hours at exactly sixty minutes", () => {
    expect(relativeTime(ago(HOUR), NOW)).toBe("Seen 1 h ago");
    expect(relativeTime(ago(HOUR * 23), NOW)).toBe("Seen 23 h ago");
  });

  it("switches to days at exactly twenty-four hours", () => {
    expect(relativeTime(ago(DAY), NOW)).toBe("Seen 1 d ago");
    expect(relativeTime(ago(DAY * 29), NOW)).toBe("Seen 29 d ago");
  });

  it("falls back to a date beyond thirty days", () => {
    const out = relativeTime(ago(DAY * 400), NOW);
    expect(out.startsWith("Seen ")).toBe(true);
    // Must not still be counting days.
    expect(out).not.toMatch(/\d+ d ago/);
  });

  it("never renders a negative age for a future timestamp", () => {
    // A car whose RTC is wrong reports a last-seen in the future. The
    // original had no branch for this and floor() would have produced
    // negative minutes; it must read as present instead.
    const future = new Date(NOW + DAY).toISOString();
    expect(relativeTime(future, NOW)).toBe("Seen just now");
    expect(relativeTime(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe(
      "Seen just now",
    );
    // And nothing anywhere may leak a minus sign.
    for (const ms of [-DAY, -MIN, 0, MIN, DAY, DAY * 90]) {
      expect(relativeTime(ago(ms), NOW)).not.toContain("-");
    }
  });

  it("defaults `now` to the current time when not supplied", () => {
    // The component calls the one-argument form, so that path must work.
    expect(relativeTime(new Date().toISOString())).toBe("Seen just now");
  });
});
