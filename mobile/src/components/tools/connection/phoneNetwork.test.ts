// =====================================================================
// U-118 (owner 2026-10-20) — "the app is not aware about its own connected
// network."
//
// Layer 1 — `formatPhoneNetwork` is PURE and imported directly, so its
// honesty rules are proven by behaviour: a disconnected phone says so, an
// withheld SSID says so, cellular is named cellular, and no state ever
// invents a network name.
//
// Layer 2 — the wiring reads the raw sources with comments stripped (same
// convention as linkCapacity.test.ts; there is no component harness in this
// repo): the hub refreshes the label on every NetInfo event and exposes it.
// U-121 (owner 2026-10-23, item 4): the label is rendered by the REMOTE's
// first bar (the merged row below Back) — the Connectivity panel's "This
// phone" row is gone, freeing its left pane; the deck chrome still stays
// free of the old raw phone-ssid chip (U-113 P2 issue 4).
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { formatPhoneNetwork } from "./phoneNetwork";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
    .join("\n");

const hub = strip(raw("../useControlHub.ts"));
const section = strip(raw("./ConnectionSection.tsx"));

describe("formatPhoneNetwork — honest copy for every state", () => {
  it("joined Wi-Fi names the network", () => {
    expect(
      formatPhoneNetwork({ type: "wifi", connected: true, ssid: "HomeNet" }),
    ).toBe("Wi-Fi · HomeNet");
  });

  it("an WITHHELD ssid says hidden — never an empty or guessed name", () => {
    expect(
      formatPhoneNetwork({ type: "wifi", connected: true, ssid: null }),
    ).toBe("Wi-Fi · network name hidden");
    expect(
      formatPhoneNetwork({ type: "wifi", connected: true, ssid: "   " }),
    ).toBe("Wi-Fi · network name hidden");
  });

  it("disconnected says 'No network' plainly (the usual whole answer)", () => {
    expect(
      formatPhoneNetwork({ type: "wifi", connected: false, ssid: "HomeNet" }),
    ).toBe("No network");
    expect(
      formatPhoneNetwork({ type: "none", connected: false, ssid: null }),
    ).toBe("No network");
    expect(
      formatPhoneNetwork({ type: "none", connected: true, ssid: null }),
    ).toBe("No network");
  });

  it("cellular is named cellular (no subnet sweep is possible over it)", () => {
    expect(
      formatPhoneNetwork({ type: "cellular", connected: true, ssid: null }),
    ).toBe("Cellular");
  });

  it("unknown/other types are named, never invented away", () => {
    expect(
      formatPhoneNetwork({ type: "vpn", connected: true, ssid: null }),
    ).toBe("Other · vpn");
    expect(formatPhoneNetwork({ type: "", connected: true, ssid: null })).toBe(
      "Unknown network",
    );
  });
});

describe("U-118 — the hub keeps the label fresh and exposes it", () => {
  it("the NetInfo watcher updates the label on every event", () => {
    const at = hub.indexOf("const phoneNetworkKeyRef = useRef");
    expect(at).toBeGreaterThan(0);
    const watcher = hub.slice(at, at + 1400);
    expect(watcher).toContain("setPhoneSsid(phoneSsidOf(state));");
    expect(watcher).toContain("setPhoneNetworkLabel(");
    expect(watcher).toContain("formatPhoneNetwork({");
    // same event → SSID and label can never disagree
    expect(watcher.indexOf("setPhoneNetworkLabel(")).toBeGreaterThan(
      watcher.indexOf("setPhoneSsid("),
    );
  });

  it("the label is part of the hub's public surface", () => {
    expect(hub).toContain("phoneNetworkLabel,");
    expect(hub).toContain(
      "const [phoneNetworkLabel, setPhoneNetworkLabel] = useState",
    );
  });
});

describe("U-121 — the label moved from the Connectivity panel to the Remote's first bar", () => {
  it("the Connectivity panel no longer renders it (owner item 4: space below)", () => {
    // The "This phone" row is gone from the panel's left pane entirely —
    // not relocated inside it. Its testID, its label source and the "This
    // phone" words all left with it.
    expect(section).not.toContain('testID="conn-phone-network"');
    expect(section).not.toContain("phoneNetworkLabel");
    expect(section).not.toContain("This phone");
    // The panel still never leaks the RAW ssid either (issue 4 kept).
    expect(section).not.toContain("phoneSsid");
  });

  it("the Remote's FIRST bar carries it with a stable testID", () => {
    const chrome = strip(raw("../../../screens/RemoteControlScreen.tsx"));
    expect(chrome).toContain('testID="remote-phone-network"');
    expect(chrome).toContain("{phoneNetworkLabel}");
    expect(chrome).toContain("phoneNetworkLabel,");
    // The raw ssid stays out of the chrome (issue 4) — the LABEL renders.
    expect(chrome).not.toContain("phoneSsid");
  });

  it("the label stays the hub's public surface (the connect screen also uses it)", () => {
    expect(hub).toContain("phoneNetworkLabel,");
    expect(hub).toContain(
      "const [phoneNetworkLabel, setPhoneNetworkLabel] = useState",
    );
  });
});
