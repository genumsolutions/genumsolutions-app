// =====================================================================
// P1 (owner 2026-10-17) — ONE prompt-state decision, pinned both ways.
//
// Owner item B ("the reconnect dialog"): it must appear at the proper time,
// carry no stale/unnecessary message, and offer ONLY Reconnect + Cancel.
//
// Two layers are pinned here:
//   1. `resolveLinkPrompt` — the PURE decision module. Imported directly, so
//      its rules are proven by behaviour (no renderer / no source scraping).
//   2. The SCREEN wiring — a source-reading pass (same convention as
//      remoteChrome.test.ts / oneActiveLink.test.ts; there is no component
//      harness in this repo) proving the deck has exactly ONE prompt renderer,
//      that the restart card has exactly TWO actions, and that the old third
//      action ("Leave") is gone.
//
// Which view each layer reads, and why (F-83): layer 1 reads the real
// exported function; layer 2 reads the RAW TSX with comments stripped. Every
// source rule below was proven in BOTH directions (mutate → red, restore →
// green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { formatBootLine, resolveLinkPrompt } from "./linkPrompt";
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

describe("P1 — resolveLinkPrompt: the reconnect card is a claim about NOW", () => {
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

  it("shows nothing before the backoff is exhausted", () => {
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

describe("P1 — resolveLinkPrompt: a restart names the cause and wins", () => {
  const restart = {
    prevBoot: 4,
    boot: 5,
    crashCount: 3,
    resetReason: "TASK_WDT",
  };

  it("formats the boot line with every available field", () => {
    expect(formatBootLine(restart)).toBe(
      "Boot 4 → 5 · reset TASK_WDT · 3 crashes",
    );
  });

  it("singularises one crash and tolerates a missing previous boot", () => {
    expect(formatBootLine({ ...restart, prevBoot: null, crashCount: 1 })).toBe(
      "Boot 5 · reset TASK_WDT · 1 crash",
    );
    expect(
      formatBootLine({ ...restart, crashCount: null, resetReason: null }),
    ).toBe("Boot 4 → 5 · reset unknown");
  });

  it("takes precedence over an exhausted backoff (the link is why it died)", () => {
    const p = resolveLinkPrompt(
      facts({ restart, sppRetryDue: true, linked: false }),
    );
    expect(p?.kind).toBe("restart");
  });

  it("names the live link now, or says 'none' honestly", () => {
    const live = resolveLinkPrompt(
      facts({
        restart,
        linked: true,
        btLinked: true,
        linkLabel: "Bluetooth",
        ipText: "192.168.4.1",
      }),
    );
    expect(live && live.kind === "restart" ? live.linkLine : "").toBe(
      "Link now: Bluetooth · 192.168.4.1",
    );
    const dead = resolveLinkPrompt(facts({ restart, linked: false }));
    expect(dead && dead.kind === "restart" ? dead.linkLine : "").toBe(
      "Link now: none",
    );
  });

  it("shows nothing when there is no restart and no exhausted backoff", () => {
    expect(resolveLinkPrompt(facts())).toBeNull();
  });
});

describe("P1 — the screen wires exactly ONE prompt decision", () => {
  it("has sources to check", () => {
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("calls resolveLinkPrompt with the live link facts", () => {
    expect(screen).toContain("resolveLinkPrompt({");
    // The facts it must feed: link truth, the backoff flag, the restart, copy.
    expect(screen).toContain("sppRetryDue: showSppsRetry");
    expect(screen).toContain("restart: carRestartNotice");
  });

  it("renders via ONE function (the two old banners are gone)", () => {
    expect(screen).toContain("const renderLinkPrompt = () => {");
    expect(screen).toContain("{renderLinkPrompt()}");
    expect(screen).not.toContain("renderReconnectBanner");
    expect(screen).not.toContain("renderRestartBanner");
  });

  it("the restart card offers exactly Reconnect + Cancel (no Leave)", () => {
    expect(screen).toContain('testID="restart-reconnect"');
    expect(screen).toContain('testID="restart-cancel"');
    // The third action is gone in BOTH forms: its testID and its label.
    expect(screen).not.toContain("restart-leave");
    expect(screen).not.toContain(">Leave<");
  });
});
