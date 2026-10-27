// =====================================================================
// U-119c — THE FEEDBACK SURFACE: the hub's connection messages must be
// rendered, pinned.
//
// The defect this test exists to stop happening again: the hub carried
// 14 showConnectionMessage() call sites that set `connectionMessage` /
// `connectionMsgType` state which NO screen rendered. The user was told
// nothing after an action — including two the code itself documents as
// safety-relevant:
//
//   • F-59 narration — "Smart-link joined <ssid> AUTOMATICALLY …", whose
//     own comment says a toast that never said "automatic" read to the
//     owner as "the app is broken";
//   • the post-reset confirmation fired from RemoteControlScreen's reset
//     button ("Car data reset — power cycle the car for a fresh start"),
//     so a successful FACTORY RESET produced no acknowledgement at all.
//
// The duplicate "Connected to" toasts were deliberately removed in
// 9029a79 ("only status header with Disconnect remains"), so this rule
// also pins that there is exactly ONE strip — the fix must not reintroduce
// the three-toast pile-up that removal was for.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TSX/TS source of
// `RemoteControlScreen.tsx` and `useControlHub.ts`, comments stripped —
// the same convention as remoteChrome.test.ts and oneActiveLink.test.ts.
// There is no component harness in this repo (no React Testing Library),
// so a rendered assertion is unavailable.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped — character literals NOT blanked. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Count non-overlapping matches — used to pin "ONE strip, not three". */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const screen = strip(raw("./RemoteControlScreen.tsx"));
const hub = strip(raw("../components/tools/useControlHub.ts"));

describe("U-119c · the hub's connection message reaches the screen", () => {
  it("imports the existing InlineMessage primitive (no new design language)", () => {
    // The strip must reuse what ConnectionSection and WifiPanel already use.
    expect(screen).toMatch(
      /ConnectionSection,[\s\S]{0,80}InlineMessage,[\s\S]{0,120}\} from "\.\.\/components\/tools\/connection";/,
    );
  });

  it("RENDERS hub.connectionMessage — the state that used to be set and never drawn", () => {
    // The fixed-height footer hosts either the connection outcome or the
    // silent-car warning without changing the controls' layout.
    expect(count(screen, "hub.connectionMessage")).toBe(3);
    expect(screen).toContain("{hub.connectionMessage || hub.carSilent ? (");
    expect(screen).toContain('className="h-12 flex-shrink-0 justify-end"');
    expect(screen).not.toContain('className="absolute left-3 right-3 z-50');
  });

  it("renders an error as an error, not as a green success line", () => {
    expect(screen).toContain('hub.connectionMsgType !== "error"');
  });

  it("exactly ONE strip exists (9029a79 removed three duplicate toasts)", () => {
    expect(count(screen, "{hub.connectionMessage || hub.carSilent ? (")).toBe(
      1,
    );
  });

  it("the hub still exposes both halves of the pair to the screen", () => {
    // Return-object entries only (4-space indent) — the 2-space `const [...]`
    // declarations must not satisfy this, or a screen that stops receiving the
    // value could still pass.
    expect(hub).toContain("\n    connectionMessage,\n");
    expect(hub).toContain("\n    connectionMsgType,\n");
  });

  it("the hub still OWNS the setter the call sites write through", () => {
    expect(hub).toContain("const showConnectionMessage = useCallback(");
    // At least 11 call sites live in the hub; the screen's post-reset
    // confirmation is asserted below. If the hub's set ever stops being called
    // the surface above would be rendering state nothing writes.
    expect(count(hub, "showConnectionMessage(")).toBeGreaterThanOrEqual(11);
    expect(count(screen, "hub.showConnectionMessage(")).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("the post-reset confirmation still fires from this screen", () => {
    // The one call site that lives OUTSIDE the hub — a factory reset must
    // acknowledge itself.
    expect(screen).toContain("hub.showConnectionMessage(");
    expect(screen).toContain(
      "Car data reset — power cycle the car for a fresh start",
    );
  });
});

// ── U-124 ⑦ (owner 2026-10-24): the strip gives back its height ──────────
// "the other messages size of the status bar of the remote screen is little
// bigger to watch — please reduce some size there too." The strip is the
// InlineMessage primitive, so the rule lives on ConnectionCard.tsx.
describe("U-124 ⑦ — the message strip is a note, not a panel", () => {
  const card = strip(raw("../components/tools/connection/ConnectionCard.tsx"));

  it("has a source to check (the rule must not pass vacuously)", () => {
    expect(card).toContain("export function InlineMessage");
    expect(card.length).toBeGreaterThan(1000);
  });

  it("tighter box, unchanged 10 px font tier", () => {
    expect(card).toContain("mt-1 rounded-md border px-2 py-1");
    expect(card).toContain("text-[10px] leading-[14px]");
    // The taller U-122 shape (mt-1.5 / px-2.5 / py-1.5 / leading-4) is gone…
    expect(card).not.toContain("mt-1.5 rounded-md border px-2.5 py-1.5");
    expect(card).not.toContain("leading-4 ${textClass}");
    // …and the reduction did NOT come out of the glyphs: the tier holds.
    expect(card).not.toContain("text-[9px]");
  });
});
