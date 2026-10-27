// =====================================================================
// U-113 P2 (1.3.11 round) — the Remote screen chrome rebuild, pinned.
//
// Owner issues 2/3/4/10/14 of the 2026-10-15 list:
//   2. the line below Back (disconnect) and the tab-pills line merged into
//      ONE constant-height row — the deck below gains their ~28 px;
//   3. each disconnect chip appears only while ITS method is live and tears
//      down ONLY its own transport (the BT chip used to call the FULL
//      handleDisconnect and killed the Wi-Fi link with it);
//   4. the "on <phone-ssid>" chip is gone (the NetInfo discovery itself
//      stays — smart-link switching uses it);
//  10. the broadcast IP right of Back IS the link to the car's page; the
//      long "BT · name + WiFi · ip (AP)" label and the duplicate page chip
//      in the tabs row are gone;
//  14. both prompts (reconnect + car-restart) are OPAQUE, high-contrast
//      cards whose copy names the real connection state.
//
// WHICH VIEW THIS READS, and why (F-83): the RAW TypeScript/TSX source of
// `RemoteControlScreen.tsx` AND `useControlHub.ts`, comments stripped — the
// same convention as oneActiveLink.test.ts. These rules are about which
// elements/handlers exist in which JSX row and which helpers the hub
// exposes; there is no component harness in this repo (no React Testing
// Library), so a rendered assertion is unavailable. Every rule below was
// proven in BOTH directions (mutate → red, restore → green) when written.
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

/** Comments stripped — character literals NOT blanked (the rules match
    identifiers, call shapes and JSX classNames, never `'…'` literals). */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const screen = strip(raw("./RemoteControlScreen.tsx"));
const hub = strip(raw("../components/tools/useControlHub.ts"));
const prompt = strip(raw("../components/tools/linkPrompt.ts"));

/** The body of `const <name> = useCallback(` … up to the next top-level
    `const <other> = useCallback(`. Anchor-based: empty slice ⇒ loud failure. */
function hubBody(name: string, nextName: string): string {
  const start = hub.indexOf(`const ${name} = useCallback(`);
  const end = hub.indexOf(`const ${nextName} = useCallback(`);
  if (start < 0 || end <= 0 || end <= start) return "";
  return hub.slice(start, end);
}

/** Occurrences of `needle` in `hay` (non-overlapping, line-based count). */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe("U-113 P2 — the Remote chrome rebuild", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(screen.length).toBeGreaterThan(5000);
    expect(hub.length).toBeGreaterThan(5000);
    expect(prompt.length).toBeGreaterThan(500);
    expect(screen).toContain('testID="remote-disconnect-bt"');
    expect(screen).toContain('testID="remote-disconnect-wifi"');
    expect(screen).toContain("renderPromptShell(");
  });

  it("issue 2: ONE merged row below Back (the second row is gone)", () => {
    // Exactly one constant-height row remains between the chrome row and the
    // content area; it carries the chips AND the pills. A second occurrence
    // means the old tabs row came back and the deck lost its space again.
    // U-121 (owner items 5/6): the one row grew h-7 → h-9 for real tap sizes.
    expect(count(screen, "flex h-7 flex-shrink-0 flex-row")).toBe(0);
    expect(
      (screen.match(/flex h-9 flex-shrink-0 flex-row/g) ?? []).length,
    ).toBe(1);
  });

  it("issue 4: the phone-net chip and its alternation are gone entirely", () => {
    // The chip, its selector and the 1 s NAME⇄IP alternation that lived with
    // it were removed from the SCREEN (phoneSsid is still exposed by the hub
    // for other surfaces; NetInfo discovery still feeds smart-link).
    expect(screen).not.toContain('testID="phone-net"');
    expect(screen).not.toContain("phoneSsid");
    expect(screen).not.toContain("netNameText");
    expect(screen).not.toContain("ipChipPhase");
  });

  it("issue 10: the IP chip right of Back is THE page link — one link only", () => {
    // Exactly one consumer of handleOpenWebPage remains in the screen: the
    // chrome chip (the definition + its single onPress). The old tabs-row
    // page chip would make this 3.
    expect(count(screen, "handleOpenWebPage")).toBe(2);
    expect(screen).toContain("onPress={handleOpenWebPage}");
    expect(count(screen, 'accessibilityRole="link"')).toBe(1);
    // The long label is gone; U-121 (items 1+2) the chip renders THE
    // BROADCAST IP ALONE, gated on the car serving its page — no transport
    // label, no car network name, nothing at all while the page is off.
    expect(screen).not.toContain("deckLinkLabel");
    expect(screen).toContain("{ipChipText}");
    expect(count(screen, "{linkLabel}")).toBe(0);
    expect(screen).not.toContain("carNetworks[0]");
    // No device name renders in the chrome label at all (A-25/A-38 kept by
    // construction — the helper that sanitized it is deleted, not dormant).
    expect(screen).not.toContain("friendlyBtName");
    // U-124 ⑪ (owner 2026-10-24): "the broadcast ip show in the remote
    // screen is little smaller font too" — the chip is the row's LINK, so it
    // sits with mode/speed on the 12 px tier, above the 11 px chips/tabs.
    expect(screen).toContain("text-[12px] font-bold text-navy");
  });

  it("issue 3: chips are per-live-method and each tears down ONLY itself", () => {
    // The BT chip is gated on the per-method truth (btLinked), not the
    // shared `connected` flag that a Wi-Fi connect also sets.
    expect(screen).toContain("{btLinked ? (");
    // A1 (owner 2026-10-23, FAILSAFE item 4): the Wi-Fi chip is ONE chip in
    // TWO variants — "Wi-Fi (hotspot)" while the car is on its own AP, "Wi-Fi"
    // while it is on a router — and the router variant is gated on the Wi-Fi
    // truth AND NOT on the hotspot, so the two can never render together.
    //
    // U-124 ⑥ (owner 2026-10-24, "when i connect the car through the bluetooth
    // method only … multiple disconnect buttons … another wifi, which is
    // duplicate") tightens A1: the HOTSPOT variant now requires the Wi-Fi link
    // too. It used to key on the phone's own network, so a Bluetooth-only
    // session sitting on the car's hotspot offered "disconnect Wi-Fi" for a
    // link that was not up. Both variants still can never render together, and
    // neither can render without a live Wi-Fi link.
    expect(screen).not.toContain("{onOwnHotspot ? (");
    expect(screen).toContain("{wifiConnected ? (");
    expect(screen).toContain('"Disconnect Wi-Fi (router)"');
    // The stale phone-network chip is not part of the remote status row.
    expect(screen).not.toContain('testID="remote-phone-network"');
    expect(screen).not.toContain('name="smartphone"');
    // Each chip calls its per-method disconnect. The full teardown
    // (`handleDisconnect`) must not be reachable from this screen anymore —
    // "handleBtDisconnect()" does NOT contain the "handleDisconnect()"
    // substring, so this assertion is exact.
    expect(screen).toContain("void handleBtDisconnect()");
    expect(screen).toContain("void handleWifiDisconnect()");
    expect(screen).not.toContain("handleDisconnect()");
  });

  it("issue 14: prompts are opaque, high-contrast cards with honest copy", () => {
    // Solid surface in BOTH themes + border-2 + shadow: nothing translucent
    // the screen text can read through (the old bg-*-50 tint merged with it).
    // Both tones carry the same solid pair — checking the tokens, not their
    // order inside the template literal.
    expect(screen).toContain("bg-white");
    expect(screen).toContain("dark:bg-slate-900");
    expect(screen).toContain("border-2");
    expect(screen).toContain("shadow-2xl");
    // The old translucent card surfaces are gone.
    expect(screen).not.toContain("bg-amber-50");
    expect(screen).not.toContain("bg-sky-50");
    // The reconnect copy names the real state (BT gone AND no Wi-Fi link);
    // the generic strings are gone. P1 (2026-10-17) moved the copy into the
    // pure `linkPrompt.ts` decision module, so the SCREEN now carries the call
    // and the module carries the words.
    expect(screen).toContain("resolveLinkPrompt(");
    // U-120 Phase C (item 8): the copy asks ONE yes/no question naming the
    // METHOD; the old narration sentences are gone with it.
    expect(prompt).toContain("Reconnect to your car over ${method}?");
    expect(prompt).not.toContain("stopping itself on link loss");
    expect(prompt).not.toContain("no Wi-Fi link is up");
    expect(screen).not.toContain('"Connection lost"');
    expect(screen).not.toContain("Reconnect to your car?");
    // U-118 (owner 2026-10-20): the restart RECORD card is gone from the
    // deck — the prompt module carries the reconnect copy only, with no
    // "Link now:" line, no boot line and no reset detail.
    expect(prompt).not.toContain("Link now:");
    expect(prompt).not.toContain("bootLine");
  });
});

describe("U-113 P2 — the hub's per-method link truth (btLinked + handleBtDisconnect)", () => {
  it("has the state and keeps it current on every BT edge", () => {
    expect(hub).toContain("const [btLinked, setBtLinked] = useState(");
    // Set true on: mount reconcile (SPP + BLE branches), SPP connected, BLE
    // connected, manual SPP connect — five edges; four is a safe floor.
    expect(
      hub.match(/setBtLinked\(true\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    // Cleared on: SPP down ×2 (disconnected/error, guarded by BLE), BLE
    // down ×2 (guarded by SPP), and the manual BT disconnect — three floor.
    expect(
      hub.match(/setBtLinked\(false\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("each BT clear consults the OTHER BT transport first", () => {
    // SPP dropping must not hide a live BLE link and vice versa — the two
    // guards are the whole correctness argument for btLinked.
    expect(hub).toContain("if (!bleService.isConnected) setBtLinked(false);");
    expect(hub).toContain('setBtLinked(false);\n          setDeviceName("");');
  });

  it("handleBtDisconnect closes BT only and LEAVES Wi-Fi up", () => {
    const body = hubBody("handleBtDisconnect", "handleWifiProvision");
    expect(body.length).toBeGreaterThan(100);
    // Closes both BT transports (safe-stopped first)…
    expect(body).toContain("await sppService.disconnect()");
    expect(body).toContain("await bleService.disconnect()");
    expect(body).toContain("setBtLinked(false)");
    // …guarded un-verify when no Wi-Fi link remains…
    expect(body).toContain("if (!wifiService.isConnected)");
    // …and NEVER touches the Wi-Fi socket: this line is the whole point of
    // the helper (the old chip called the full handleDisconnect, which
    // disconnected Wi-Fi too).
    expect(body).not.toContain("wifiService.disconnect()");
  });
});

describe("Q2 (owner 2026-10-22) — the merged row drops telemetry FIRST", () => {
  it("has a source to check (the rule must not pass vacuously)", () => {
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("the compact telemetry line is the ONLY width-gated thing in the row", () => {
    // The Q2 default: on a narrow phone the telemetry fields shrink/drop
    // first; the disconnect chips and the tab pills are controls and always
    // fit. Exactly ONE width gate exists in the whole screen and it wraps
    // TelemetryLine — a second gate would mean a control started hiding too,
    // and no gate would mean the telemetry line overflows the row again.
    expect(screen).toContain("const MERGED_ROW_TELEMETRY_MIN_PX = 860;");
    expect(count(screen, "width >= MERGED_ROW_TELEMETRY_MIN_PX")).toBe(1);
    // (U-121: the phone-network chip added to this row TRUNCATES instead of
    // hiding, so the single width gate stays telemetry-only.)
    expect(
      /width >= MERGED_ROW_TELEMETRY_MIN_PX \? \(\s*<TelemetryLine \{\.\.\.driveTelemetryArgs\} \/>\s*\) : null/.test(
        screen,
      ),
    ).toBe(true);
  });

  it("the chips and pills render ungated inside the one merged row", () => {
    // One merged row (issue 2's pin) carrying both controls unconditionally.
    expect(count(screen, "flex h-9 flex-shrink-0 flex-row")).toBe(1);
    expect(screen).toContain('testID="remote-disconnect-bt"');
    expect(screen).toContain('testID="remote-disconnect-wifi"');
    // The pill labels are multiline JSX (`>` … D-pad … `<`), so match
    // across whitespace rather than the adjacent-characters form.
    expect(
      (screen.match(/>[\s\n]*D-pad[\s\n]*</g) ?? []).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (screen.match(/>[\s\n]*Connectivity[\s\n]*</g) ?? []).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// U-120 Phase E (owner item 12, 2026-10-22) — "in the setting it is auto
// join LAST USED router, not other ways — in sense and operations."
//
// The switch controls the car's persisted boot preference only. The app must
// not issue a second router join after a link comes up; the firmware owns the
// boot-time reachability check and AP fallback.
// =====================================================================
describe("remembered-router setting is firmware boot behavior", () => {
  const profile = strip(raw("../components/tools/CarProfileCard.tsx"));

  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(profile.length).toBeGreaterThan(2000);
    expect(profile).toContain("Remember last used router");
    expect(screen).toContain("Remember last used router");
  });

  it("sense: the Remote settings switch names the remembered router", () => {
    expect(screen).toContain("Remember last used router");
    expect(screen).toContain("At power-up, use it if available");
    expect(screen).toContain(
      'accessibilityLabel="Remember the last used router at power-up; keep the car\'s own access point if it is unavailable"',
    );
    expect(screen).not.toContain("strongest saved router");
    expect(screen).not.toContain("Auto-join saved router (app)");
  });

  it("sense: the car profile card carries the same words", () => {
    expect(profile).toContain("Remember last used router");
    expect(profile).toMatch(/At power-up, join it if available/);
    expect(profile).not.toContain("strongest saved router");
    expect(profile).not.toContain("Auto-join saved router (app)");
  });

  it("does not issue a second app-side router join when a link comes up", () => {
    expect(hub).not.toContain("smartLinkFiredRef");
    expect(hub).not.toContain("fireRouterUse");
    expect(hub).not.toContain("pickBestRouter(");
    expect(hub).toContain(
      'sendSystemLine(`WIFICFG;${which};${on ? "ON" : "OFF"}`)',
    );
  });
});

// =====================================================================
// U-121 (owner 2026-10-23) — the chrome tells the truth about the PAGE;
// the Remote status row contains no phone-network chip.
//
//   1. the chrome chip is THE BROADCAST IP ALONE — no "BT+WiFi" transport
//      label, no car network name;
//   2. it renders ONLY while the Webpage toggle is ON in the car (car truth
//      `pageOn`) behind a live link — and it resolves over a BT-only link
//      too (the car reports `;IP=` on STATE over Bluetooth as well);
//   4. the stale phone-network label and its unused left-side space are gone;
//   5. the tab pills carry real tap sizes (px-4 py-2, 12 px bold — U-124 ③
//      re-measured them to px-3 py-1.5, 11 px, so the text fits the row);
//   6. the disconnect chips are real: bigger, transport icon + name + ✕.
// =====================================================================
describe("U-121 — the chrome chip is the broadcast IP, only while the page is on", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(screen.length).toBeGreaterThan(5000);
    expect(screen).toContain('testID="deck-link-status"');
  });

  it("the chip renders ONLY behind a live link while the car serves its page", () => {
    // The gate requires a live link, car page enabled, Wi-Fi transport enabled,
    // and a valid address for the car's current network.
    //
    // U-124 ⑫ (owner 2026-10-24, "the ip is not hidden anywhere … when
    // webpage is off"): the gate was `hub.carPageServing?.current ?? false`
    // with NO live-link half — and the hub's opinion was a never-written ref
    // OBJECT (always truthy), so the chip never hid. The opinion is now a
    // real boolean (hub pin below).
    expect(screen).toContain(
      "isCarPageReachable(hub.carPageServing, hub.wifiEnabled) &&",
    );
    expect(screen).toContain("pageIp !== null;");
    expect(screen).toContain("{pageLinkReady ? (");
    // The chip body is the IP alone: no transport label, no car network.
    expect(screen).toContain("{ipChipText}");
    expect(count(screen, "{linkLabel}")).toBe(0);
    expect(screen).not.toContain("carNetworks[0]");
  });

  it("the remote row contains no stale phone-network label", () => {
    expect(screen).not.toContain('testID="remote-phone-network"');
    expect(screen).not.toContain("{phoneNetworkLabel}");
    expect(screen).not.toContain('name="smartphone"');
    // Q2's telemetry drop rule remains the only width gate.
    expect(count(screen, "width >= MERGED_ROW_TELEMETRY_MIN_PX")).toBe(1);
  });

  it("items 5+6: real tap sizes and a real disconnect mark", () => {
    // Four tab pills at the new size (U-121 kept, widgets 4→4; U-124 ③
    // re-measured them down to px-3 py-1.5 / 11 px so the LABELS fit the row
    // at 640 px instead of being pushed off its right edge).
    expect(
      (screen.match(/rounded-full px-3 py-1.5/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
    expect((screen.match(/rounded-full px-4 py-2/g) ?? []).length).toBe(0);
    // …every disconnect chip carries the transport icon + name + ✕…
    // THREE render sites for TWO chips: Bluetooth, Wi-Fi (hotspot), Wi-Fi —
    // A1 (owner 2026-10-23) split the Wi-Fi chip into its hotspot/router
    // variants and each variant must keep its own ✕ (the owner's "not proper
    // disconnect icon"). The pin was 2 before that split.
    expect(count(screen, 'name="x-circle"')).toBe(2);
    // The Q2 owner-default: the compact telemetry line is the FIRST thing
    // dropped on narrow screens — controls never hide. Exactly ONE width gate
    // wraps TelemetryLine, so the chips and pills are ungated.
    expect(count(screen, "width >= MERGED_ROW_TELEMETRY_MIN_PX")).toBe(1);
    // The old 9 px sliver sizing is gone from the row.
    expect(count(screen, "px-2.5 py-0.5")).toBe(0);
  });
});

// =====================================================================
// U-123 (owner 2026-10-24, the storyboard/wireframe re-review) — six
// findings, each pinned here:
//   1. storyboard §1's malformed table row (doc fix, in storyboard.md);
//   2. the type scale: mode name AND speed value both live on the 12 px
//      tier (were 13 / 11) and NO text sits below the scale's 9 px floor
//      (the merged row's telemetry labels were 8 px);
//   3. the settings panel's first group no longer doubles the divider;
//   4. the settings panel advertises its scroll (danger zone discoverable);
//   5. the phone chip is information: no dead press handler, no shrunk-0/
//      flex-1 contradiction on one element;
//   6. stale size comment in this file's U-121 header (fixed above).
// =====================================================================
describe("U-123 — the type scale, the settings rhythm, the honest chip", () => {
  const modeChooser = strip(raw("../components/tools/ModeChooser.tsx"));
  const telemetryView = strip(raw("../components/tools/DriveTelemetry.tsx"));

  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(modeChooser.length).toBeGreaterThan(1000);
    expect(telemetryView.length).toBeGreaterThan(1000);
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("mode name and speed value both render at the 12 px tier", () => {
    // ModeChooser's trigger: was text-[13px] (above the declared tier).
    expect(modeChooser).toContain("text-[12px] font-bold");
    expect(modeChooser).not.toContain("text-[13px]");
    // The Speed strip's VALUE: was font-mono text-[11px] (below the tier).
    expect(screen).toContain("font-mono text-[12px] font-bold");
    expect(count(screen, "font-mono text-[11px]")).toBe(0);
  });

  it("no text below the scale's floor: the telemetry labels were 8 px", () => {
    expect(telemetryView).toContain(
      "text-[10px] font-black uppercase tracking-[0.14em]",
    );
    expect(count(telemetryView, "text-[8px]")).toBe(0);
  });

  it("settings: one rule per group and the panel advertises its scroll", () => {
    // The panel header's own border-b (the doubled rule above CAR
    // CONNECTION) is gone.
    expect(screen).not.toContain(
      "justify-between gap-2 border-b border-line pb-1.5",
    );
    // The settings panel shows its indicator (danger zone below the fold on
    // short screens must stay discoverable); the Connectivity pane keeps
    // its own hidden indicator — one of each, no more.
    expect(count(screen, "showsVerticalScrollIndicator={true}")).toBe(1);
    expect(count(screen, "showsVerticalScrollIndicator={false}")).toBe(1);
  });

  it("does not render the stale network chip or reserve its width", () => {
    expect(count(screen, 'testID="remote-phone-network"')).toBe(0);
    expect(screen).not.toContain(
      "max-w-[168px] rounded-full border border-line",
    );
    expect(count(screen, "width >= MERGED_ROW_TELEMETRY_MIN_PX")).toBe(1);
  });
});

describe("U-124 ①+⑤ — the phone's strip: black camera band, status bar shown", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    // Camera band Views removed — the black strip Views are gone
    // but the `cameraBand` and `shellTop` layout constants are kept for padding
    expect(screen).not.toContain('testID="remote-camera-band"');
    expect(screen).not.toContain('testID="remote-camera-band-left"');
    expect(screen).not.toContain('testID="remote-camera-band-right"');
  });

  it("the top inset is claimed as a SOLID BLACK band, not the theme surface", () => {
    // The band (camera cutout strip) has been removed — no black band
    // painted by the root's `bg-surface` anymore. The status bar is
    // now directly on the edge, no black band overlay.
    // Since the band is gone, we verify the background is NOT a black band.
    expect(screen).not.toContain('backgroundColor: "#000000"');
    // No paddingMax pattern since there's no band taking layout space
    expect(screen).not.toContain("paddingTop: insets.top");
    // No cameraBand reference since the band is removed
    expect(screen).not.toContain("{cameraBand > 0 ? (");
  });

  it("the band is an OVERLAY removed — no layout-absorbed inset", () => {
    // The band (camera cutout strip) has been removed — it is no longer
    // an overlay or flow sibling. There is no `cameraBand` or `shellTop`
    // derived from the old band layout.
    // The status bar sits directly on the edge.
    expect(screen).not.toMatch(
      /position: "absolute",\s+top: 0,\s+left: 0,\s+right: 0,\s+height: cameraBand,/,
    );
    expect(screen).not.toContain("paddingTop: shellTop,");
  });

  it("the LANDSCAPE camera hole is blacked out on the side edge", () => {
    // 2026-10-25 (owner): "there is weird space on the left of that back
    // button too where there is the hole for the camera position which should
    // be blacked out … you forgot that page is landscape view." The screen is
    // landscape-LOCKED, so the punch-hole is `insets.left`/`insets.right` —
    // that strip was still the theme surface.
    // Since the side bands are removed, we verify no side band rendering exists.
    expect(screen).not.toContain("const sideBandLeft = insets.left;");
    expect(screen).not.toContain("const sideBandRight = insets.right;");
    expect(screen).not.toContain("{sideBandLeft > 0 ? (");
    expect(screen).not.toContain("{sideBandRight > 0 ? (");
    // Camera band right is also removed
    expect(screen).not.toContain('testID="remote-camera-band-right"');
    // Content should use the full width without side band restrictions
    expect(screen).toContain("paddingLeft: 12,");
    expect(screen).toContain("paddingRight: 12,");
  });

  it("the content uses only the REMAINING space, below the band", () => {
    // The band has been removed — content uses fixed padding instead of band-derived values
    expect(screen).toContain("paddingTop: Math.max(insets.top, 8),");
    expect(screen).toContain("paddingLeft: 12,");
    expect(screen).toContain("paddingRight: 12,");
    // The settings dropdown anchors to the same origin — one top edge for
    // every layer of the screen.
    expect(screen).toContain("top: 56,");
    expect(screen).not.toContain("Math.max(insets.top, 8) + 48");
  });

  it("the system status bar is asked for, light on black, never hidden", () => {
    expect(screen).toContain("hidden={false}");
    expect(screen).toContain('barStyle="light-content"');
    expect(screen).toContain('backgroundColor="#000000"');
  });
});

// ── U-124 ④ (owner 2026-10-24): the settings window — wider, tighter, fit ──
// "the font of the setting tab is also little big and over flowing and there
// is improper space on the bottom of the setting item. Also increase the
// width of the setting window too."
describe("U-124 ④ — the settings window fits its own content", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(screen).toContain("w-80 max-w-[92%]");
    expect(screen.length).toBeGreaterThan(5000);
  });

  it("the window is WIDER (288 → 320) so the long labels stop wrapping", () => {
    // Measured in headless Chrome: "Remember last used router" at the
    // old 11 px is 215 px wide and only had 187 px of room in w-72/p-2.5 —
    // it wrapped, which is the "over flowing" the owner saw. At 10 px in
    // w-80/p-2 it is 196 px in 223 px of room: one line, with margin for a
    // system font scale.
    expect(screen).not.toContain("w-72 rounded-2xl");
    expect(screen).toContain(
      "w-80 max-w-[92%] rounded-2xl border border-line bg-card p-2",
    );
  });

  it("the panel's own type steps DOWN one tier, hierarchy kept", () => {
    // Every row label + the danger title + the reset button sit on the 10 px
    // captions tier; the captions under them on the 9 px floor; group headers
    // stay 9 px caps; nothing in the panel is 11 px anymore — the 11 px that
    // REMAIN on this screen are the chrome-row chips, the tabs and the prompt
    // buttons, i.e. the tier ABOVE the panel.
    expect(count(screen, "text-[11px] font-bold uppercase")).toBe(0);
    expect(count(screen, "text-[11px] font-bold")).toBeGreaterThan(0);
    expect(count(screen, "text-[9px] leading-tight text-muted")).toBe(2);
    expect(count(screen, "text-[9px] leading-3 text-muted")).toBe(1);
  });

  it("every setting item closes with the same, tighter bottom gap", () => {
    // The old rhythm mixed mt-1 / mt-1.5 / mt-2.5 tops and pt-1.5 / pt-2
    // under the rules, so the bottom of one item did not match the next.
    expect(count(screen, "mt-1.5 flex-row items-center justify-between")).toBe(
      0,
    );
    expect(count(screen, "mt-2.5 border-t border-line")).toBe(0);
    expect(count(screen, "mt-1.5 border-t border-line pt-1")).toBe(1);
    expect(count(screen, "mt-2 border-t border-line pt-1.5")).toBe(1);
    expect(
      count(screen, 'className="mt-1 flex-row items-center justify-between'),
    ).toBeGreaterThanOrEqual(5);
  });
});
