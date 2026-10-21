// =====================================================================
// P1 — ONE prompt-state decision, pinned both ways.
// U-118 (owner 2026-10-20) — "the reconnect shows the last reset thing,
// remove that."
//
// Owner item B ("the reconnect dialog"): it must appear at the proper time,
// carry no stale/unnecessary message, and offer ONLY Reconnect + Cancel.
// U-118 narrows it further: the deck's SECOND card — the restart RECORD
// (Boot N → N+1 · reset REASON · crash count, with its own Reconnect/Cancel
// pair) — is gone from the deck entirely. The reset record still leads the
// Control Panel's "Last restart record" (P2, ToolsScreen); nothing here
// removes it from where the owner acts on it.
//
// What survives is only the CAUSE: a detected restart may raise the ONE
// reconnect card (the car rebooted and no link is up — a true claim about
// NOW) and swap in one plain sentence. No number, no reset reason and no
// crash count may ever reach this card — that is the rule this file exists
// to pin.
//
// Two layers are pinned here:
//   1. `resolveLinkPrompt` — the PURE decision module. Imported directly, so
//      its rules are proven by behaviour (no renderer / no source scraping).
//   2. The SCREEN wiring — a source-reading pass (same convention as
//      remoteChrome.test.ts / oneActiveLink.test.ts; there is no component
//      harness in this repo) proving the deck has exactly ONE prompt
//      renderer, that the restart card is gone in both its testIDs and its
//      branch, and that the surviving card offers exactly Reconnect +
//      Cancel.
//
// Which view each layer reads, and why (F-83): layer 1 reads the real
// exported function; layer 2 reads the RAW TSX with comments stripped. Every
// source rule below was proven in BOTH directions (mutate → red, restore →
// green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveLinkPrompt } from "./linkPrompt";
import type { LinkPromptArgs } from "./linkPrompt";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped (identifiers / JSX shapes are what the rules match). */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const screen = strip(raw("../../screens/RemoteControlScreen.tsx"));

/** A benign "nothing is wrong" fact set; each test overrides one field. */
function facts(over: Partial<LinkPromptArgs> = {}): LinkPromptArgs {
  return {
    linked: false,
    btLinked: false,
    wifiConnected: false,
    sppRetryDue: false,
    restart: null,
    linkLabel: "Offline",
    ipText: null,
    ...over,
  };
}

/** The restart facts the hub raises on a boot-count increase. */
const restart = {
  prevBoot: 4,
  boot: 5,
  crashCount: 3,
  resetReason: "TASK_WDT",
};

describe("U-118 — resolveLinkPrompt: the reconnect card is a claim about NOW", () => {
  it("shows nothing when the backoff is exhausted but a link is live", () => {
    // The whole field bug this guards: a live Wi-Fi link must retire the
    // "Bluetooth disconnected" claim (F-85).
    expect(
      resolveLinkPrompt(
        facts({ sppRetryDue: true, linked: true, wifiConnected: true }),
      ),
    ).toBeNull();
    expect(
      resolveLinkPrompt(
        facts({ sppRetryDue: true, linked: true, btLinked: true }),
      ),
    ).toBeNull();
  });

  it("shows nothing before the backoff is exhausted (and no restart)", () => {
    expect(
      resolveLinkPrompt(facts({ sppRetryDue: false, linked: false })),
    ).toBeNull();
  });

  it("shows the reconnect card only when nothing is up", () => {
    const p = resolveLinkPrompt(facts({ sppRetryDue: true, linked: false }));
    expect(p?.kind).toBe("reconnect");
    expect(p && p.kind === "reconnect" ? p.body : "").toContain(
      "no Wi-Fi link is up",
    );
    expect(p && p.kind === "reconnect" ? p.title : "").toBe(
      "Bluetooth disconnected",
    );
  });

  it("a cleared cause dismisses it (same facts, one field flipped)", () => {
    // Raised…
    expect(
      resolveLinkPrompt(facts({ sppRetryDue: true, linked: false }))?.kind,
    ).toBe("reconnect");
    // …then retired the moment EITHER the backoff clears OR a link comes up.
    expect(
      resolveLinkPrompt(facts({ sppRetryDue: false, linked: false })),
    ).toBeNull();
    expect(
      resolveLinkPrompt(
        facts({ sppRetryDue: true, linked: true, btLinked: true }),
      ),
    ).toBeNull();
  });
});

describe("U-118 — a restart is a CAUSE, never a record", () => {
  it("a restart with no link raises the ONE reconnect card", () => {
    // The restart is why the link died, so it may prompt before the backoff
    // exhausts — but it prompts with the RECONNECT card, nothing else.
    const p = resolveLinkPrompt(facts({ restart, linked: false }));
    expect(p?.kind).toBe("reconnect");
  });

  it("the copy names the restart plainly — no numbers, no record", () => {
    const p = resolveLinkPrompt(facts({ restart, linked: false }));
    const body = p && p.kind === "reconnect" ? p.body : "";
    expect(body).toContain("Your car restarted");
    // THE U-118 RULE: the last-reset record never reaches this card.
    expect(body).not.toMatch(/boot|crash|task_wdt|reset/i);
    expect(p && p.kind === "reconnect" ? p.title : "").toBe(
      "Bluetooth disconnected",
    );
  });

  it("a restart while a link is live raises NOTHING", () => {
    // The old restart card could show with a link up (it was informational).
    // U-118 removes that surface: if the car is reachable, the deck is quiet.
    expect(
      resolveLinkPrompt(
        facts({
          restart,
          linked: true,
          btLinked: true,
          linkLabel: "Bluetooth",
        }),
      ),
    ).toBeNull();
    expect(
      resolveLinkPrompt(
        facts({ restart, linked: true, wifiConnected: true, ipText: "x" }),
      ),
    ).toBeNull();
  });

  it("restart + exhausted backoff still yields exactly one card", () => {
    const p = resolveLinkPrompt(
      facts({ restart, sppRetryDue: true, linked: false }),
    );
    expect(p?.kind).toBe("reconnect");
  });

  it("the module carries no record formatter or record fields anymore", () => {
    const src = raw("./linkPrompt.ts");
    expect(src).not.toContain("formatBootLine");
    expect(src).not.toContain("bootLine");
    expect(src).not.toContain("linkLine");
    expect(src).not.toContain('"restart"');
  });
});

describe("U-118 — the screen wires exactly ONE prompt decision", () => {
  it("has sources to check", () => {
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("calls resolveLinkPrompt with the live link facts", () => {
    expect(screen).toContain("resolveLinkPrompt({");
    // The facts it must feed: link truth, the backoff flag, the restart CAUSE.
    expect(screen).toContain("sppRetryDue: showSppsRetry");
    expect(screen).toContain("restart: carRestartNotice");
  });

  it("renders via ONE function (both old banners are gone)", () => {
    expect(screen).toContain("const renderLinkPrompt = () => {");
    expect(screen).toContain("{renderLinkPrompt()}");
    expect(screen).not.toContain("renderReconnectBanner");
    expect(screen).not.toContain("renderRestartBanner");
  });

  it("the restart card is GONE — branch, testIDs and actions all removed", () => {
    expect(screen).not.toContain('"restart"');
    expect(screen).not.toContain("restart-reconnect");
    expect(screen).not.toContain("restart-cancel");
    expect(screen).not.toContain("handleRestartReconnect");
    expect(screen).not.toContain("handleRestartDismiss");
    // Its record lines are gone with it (the record lives in ToolsScreen).
    expect(screen).not.toContain("bootLine");
    expect(screen).not.toContain("linkLine");
  });

  it("the surviving card offers exactly Reconnect + Cancel (no Leave)", () => {
    expect(screen).toContain('testID="reconnect-retry"');
    expect(screen).toContain('testID="reconnect-cancel"');
    // The third action is gone in BOTH forms: its testID and its label.
    expect(screen).not.toContain("restart-leave");
    expect(screen).not.toContain(">Leave<");
  });

  it("cancelling clears the restart cause too (the card must be dismissible)", () => {
    const hub = strip(raw("./useControlHub.ts"));
    const at = hub.indexOf("const handleReconnectPromptCancel = useCallback");
    expect(at).toBeGreaterThan(0);
    expect(hub.slice(at, at + 700)).toContain("setCarRestartNotice(null);");
    // The restart card's dedicated handlers are dead and must be gone.
    expect(hub).not.toContain("const handleRestartReconnect");
    expect(hub).not.toContain("const handleRestartDismiss");
  });
});
