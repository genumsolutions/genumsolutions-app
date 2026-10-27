// =====================================================================
// P1 — ONE prompt-state decision, pinned both ways.
// U-118 (owner 2026-10-20) — "the reconnect shows the last reset thing,
// remove that."
//
// Owner item B ("the reconnect dialog"): it must appear at the proper time,
// carry no stale/unnecessary message, and offer ONLY Reconnect + Cancel.
// U-120 Phase C (owner 2026-10-22, item 8): reconnecting is NEVER
// automatic — no transport re-dials or silent-backoffs anymore. The card
// names the METHOD that dropped, asks one yes/no question, and only
// reconnects if the user says yes (screen routes through
// handleReconnectConfirm). This file pins both halves of that: the pure
// decision/copy, and the source shape proving no auto-retry machinery is
// left anywhere.
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
    reconnectDue: false,
    method: "Bluetooth",
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
  it("shows nothing when a drop awaits the answer but a link is live", () => {
    // The whole field bug this guards: a live Wi-Fi link must retire the
    // "Bluetooth disconnected" claim (F-85).
    expect(
      resolveLinkPrompt(
        facts({ reconnectDue: true, linked: true, wifiConnected: true }),
      ),
    ).toBeNull();
    expect(
      resolveLinkPrompt(
        facts({ reconnectDue: true, linked: true, btLinked: true }),
      ),
    ).toBeNull();
  });

  it("shows nothing when no drop awaits and no restart", () => {
    expect(
      resolveLinkPrompt(facts({ reconnectDue: false, linked: false })),
    ).toBeNull();
  });

  it("shows the reconnect card only when nothing is up", () => {
    const p = resolveLinkPrompt(facts({ reconnectDue: true, linked: false }));
    expect(p?.kind).toBe("reconnect");
    // U-120 item 8: name the method, explain why controls are paused, and give
    // the user a bounded retry expectation instead of repeating a bare prompt.
    expect(p && p.kind === "reconnect" ? p.body : "").toContain(
      "The Bluetooth link is down, so controls are paused.",
    );
    expect(p && p.kind === "reconnect" ? p.body : "").toContain(
      "Reconnect makes one attempt;",
    );
    expect(p && p.kind === "reconnect" ? p.title : "").toBe(
      "Bluetooth disconnected",
    );
    expect(p && p.kind === "reconnect" ? p.method : "").toBe("Bluetooth");
  });

  it("the Wi-Fi method is named and routed as Wi-Fi (proper method)", () => {
    // Owner item 8: the dialog prompts "with proper method" — a Wi-Fi drop
    // must SAY Wi-Fi in both title and body and expose the method so the
    // screen can route Reconnect to the Wi-Fi re-dial.
    const p = resolveLinkPrompt(
      facts({ reconnectDue: true, linked: false, method: "Wi-Fi" }),
    );
    expect(p?.kind).toBe("reconnect");
    expect(p && p.kind === "reconnect" ? p.title : "").toBe(
      "Wi-Fi disconnected",
    );
    expect(p && p.kind === "reconnect" ? p.body : "").toContain(
      "The Wi-Fi link is down, so controls are paused.",
    );
    expect(p && p.kind === "reconnect" ? p.method : "").toBe("Wi-Fi");
  });

  it("a cleared cause dismisses it (same facts, one field flipped)", () => {
    // Raised…
    expect(
      resolveLinkPrompt(facts({ reconnectDue: true, linked: false }))?.kind,
    ).toBe("reconnect");
    // …then retired the moment EITHER the drop is answered/cleared OR a link
    // comes up.
    expect(
      resolveLinkPrompt(facts({ reconnectDue: false, linked: false })),
    ).toBeNull();
    expect(
      resolveLinkPrompt(
        facts({ reconnectDue: true, linked: true, btLinked: true }),
      ),
    ).toBeNull();
  });
});

describe("U-118 — a restart is a CAUSE, never a record", () => {
  it("a restart notice alone never raises a reconnect card", () => {
    // A previous restart notice must not reopen the prompt after the user
    // intentionally disconnected.
    expect(resolveLinkPrompt(facts({ restart, linked: false }))).toBeNull();
  });

  it("a real unexpected drop may use the restart as plain cause copy", () => {
    const p = resolveLinkPrompt(
      facts({ restart, reconnectDue: true, linked: false }),
    );
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

  it("restart + an unexpected drop still yields exactly one card", () => {
    const p = resolveLinkPrompt(
      facts({ restart, reconnectDue: true, linked: false }),
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
    // The facts it must feed: link truth, the pending-drop flag + METHOD,
    // and optional restart context for the copy.
    expect(screen).toContain("reconnectDue,");
    expect(screen).toContain("method: reconnectMethod");
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

// =====================================================================
// U-120 Phase C (owner item 8) — "reconnecting should not be automatic."
//
// Both former auto-retry paths are DELETED, not bypassed, and the dialog is
// the ONLY recovery path: a source-shape pass over the hub + the Wi-Fi
// transport + the screen proves (mutate → red, restore → green):
//   1. no SPP silent backoff scheduler exists,
//   2. the Wi-Fi service has no quiet re-dial (no scheduleReconnect),
//   3. the screen's Reconnect routes through handleReconnectConfirm, which
//      picks the method — there is no straight-to-retry button anymore.
// =====================================================================
describe("U-120 Phase C — reconnecting is never automatic", () => {
  const hub = strip(raw("./useControlHub.ts"));
  const wifi = strip(raw("../../services/wifiService.ts"));

  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(hub.length).toBeGreaterThan(5000);
    expect(wifi.length).toBeGreaterThan(2000);
    expect(hub).toContain("const handleReconnectConfirm = useCallback");
    expect(wifi).toContain('emitStatus("reconnecting"');
  });

  it("the SPP silent backoff scheduler is GONE from the hub", () => {
    expect(hub).not.toContain("startSppReconnect");
    expect(hub).not.toContain("sppReconnectTimerRef");
    expect(hub).not.toContain("sppReconnectAttemptsRef");
    expect(hub).not.toContain("sppReconnectActiveRef");
    expect(hub).not.toContain("SPP_RECONNECT_DELAYS_MS");
  });

  it("the Wi-Fi service has no re-dial of its own", () => {
    // The old path: an unexpected close scheduled scheduleReconnect(url) —
    // a quiet re-dial that could loop on a dead address. Gone: an unexpected
    // close only ANNOUNCES the drop; the dialog owns every retry.
    expect(wifi).not.toContain("scheduleReconnect");
    expect(wifi).not.toContain("RECONNECT_DELAY_MS");
    expect(wifi).not.toContain("MAX_RECONNECTS");
  });

  it("only an established, unexpected SPP drop can raise the Bluetooth dialog", () => {
    // SPP drop → Bluetooth; Wi-Fi drop (the old re-dial case) → Wi-Fi.
    expect(hub).toContain('setReconnectMethod("Bluetooth")');
    expect(hub).toContain('setReconnectMethod("Wi-Fi")');
    expect(hub).toContain(
      "const hadLiveConnection = sppWasConnectedRef.current;",
    );
    expect(hub).toContain("hadLiveConnection &&");
    // A manual drop or failed initial dial never asks.
    expect(hub).toContain("setReconnectDue(false)");
  });

  it("the screen reconnects ONLY through the method-routing confirm", () => {
    // The button must not dial a transport directly anymore: Reconnect →
    // handleReconnectConfirm (Bluetooth retry vs Wi-Fi re-dial by method).
    expect(screen).toContain("void handleReconnectConfirm();");
    expect(screen).not.toContain("void handleSppsRetry();");
    expect(hub).toContain('reconnectMethod === "Wi-Fi"');
  });
});
