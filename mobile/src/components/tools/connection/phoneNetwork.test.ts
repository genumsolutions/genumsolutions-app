// =====================================================================
// The phone's OWN network label remains available to connection flows through
// the hub, but is intentionally absent from the Remote status row.
//
//   1. the hub owns the label source
//   2. the Connectivity panel does NOT carry it
//   3. the Remote's FIRST bar does NOT carry it (the owner called the text and
//      blank space below Back stale and unnecessary)
//   4. the Raw ssid never leaks — only the formatted label, ever (issue 4)
// =====================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatPhoneNetwork } from "./phoneNetwork";

const __dirname = dirname(fileURLToPath(import.meta.url));

function raw(rel: string): string {
  // Resolve relative to this test file's directory.
  return readFileSync(join(__dirname, rel), "utf8");
}

/** Comments stripped; `//` preceded by `:` (URL literals) survives. */
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const RAW_HUB = raw("../useControlHub.ts");
const hub = strip(RAW_HUB);

const RAW_SECTION = raw("./ConnectionSection.tsx");
const section = strip(RAW_SECTION);

function chromeRaw(): string {
  // RemoteControlScreen lives in src/screens/.
  // From phoneNetwork.test.ts (src/components/tools/connection/), that's
  // THREE levels up (components/tools/connection => components/tools =>
  // components => src) then DOWN into screens/.
  const base = join(
    __dirname,
    "..",
    "..",
    "..",
    "screens",
    "RemoteControlScreen.tsx",
  );
  return readFileSync(base, "utf8");
}
const RAW_CHROME = chromeRaw();
const chrome = strip(RAW_CHROME);

describe("phone-network label ownership", () => {
  it("the hub owns the phone-network label source", () => {
    expect(hub).toContain("phoneNetworkLabel,");
    expect(hub).toContain(
      "const [phoneNetworkLabel, setPhoneNetworkLabel] = useState",
    );
    expect(hub).toContain("phoneNetworkLabel,");
    expect(hub).toContain("setPhoneNetworkLabel");
  });

  it("the raw ssid never leaks into the Connectivity panel (issue 4)", () => {
    // U-121 keeps issue 4's invariant: the Connectivity panel surfaces only
    // the formatted phoneNetworkLabel, never the raw ssid string.
    expect(section).not.toContain("phoneSsid");
  });

  it("the Connectivity panel does NOT carry the 'This phone' box (owner 2026-10-23: remove it as the whole)", () => {
    // The row the owner ordered removed is gone from this file entirely —
    // no testID, no "This phone" heading, no label. The label's ONE render
    // site is the Remote's first bar (next test), so it can never appear
    // twice on the Remote screen (this section renders INSIDE it).
    expect(section).not.toContain('testID="conn-phone-network"');
    expect(section).not.toContain("This phone");
    expect(section).not.toContain("phoneNetworkLabel");
  });
  it("the Remote status row omits the stale phone-network chip", () => {
    expect(chrome).not.toContain('testID="remote-phone-network"');
    expect(chrome).not.toContain("{phoneNetworkLabel}");
    expect(chrome).not.toContain("phoneNetworkLabel,");
    expect(chrome).not.toContain('name="smartphone"');
    // The raw ssid stays out of the chrome (issue 4) — the LABEL renders.
    expect(chrome).not.toContain("phoneSsid");
  });

  it("the label stays the hub's public surface (the connect screen also uses it)", () => {
    // The phone-network label is still available to DeviceConnectionScreen
    // using it (from the same hub surface), even though this particular
    // screen no longer renders the row itself.
    expect(hub).toContain("phoneNetworkLabel,");
  });
});

// ── U-124 ② (owner 2026-10-24): the label must NAME the network ──────────
// "shows the wifi. name hidden, which is meaningless and should show the
// wifi network the app is connected to, at all time and in sync with the
// phone's network." The hub goes and GETS the name (the location permission
// Android gates the SSID behind).
//
// 2026-10-25 (owner, second ruling): "the remote screen show the wifi subnet
// mask which is stupid remove that" — the U-124 ② stand-in that named a
// still-unnamed network by its subnet is gone; a mask is not a name.
describe("U-124 ② — the phone's network is NAMED, and asked for when withheld", () => {
  it("the hub asks for the permission the SSID is gated behind, once", () => {
    expect(hub).toContain(
      "PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION",
    );
    expect(hub).toContain("PermissionsAndroid.request(permission)");
    // Once per session, and only while a Wi-Fi network is live and unnamed.
    expect(hub).toContain("const ssidPermissionAskedRef = useRef(false);");
    expect(hub).toContain("if (phoneSsid) return;");
    // …and the answer is consumed: a granted ask re-reads NetInfo so the real
    // name lands without a restart or a network change.
    expect(hub).toContain("publishPhoneNetState(await NetInfo.fetch());");
  });

  it("one writer publishes ssid + label together (they can never disagree)", () => {
    expect(hub).toContain("const publishPhoneNetState = useCallback(");
    expect(hub).toContain("ssid,\n      }),\n    );");
    // The subnet stand-in is GONE from the pipeline (2026-10-25): no field,
    // no reader, no residue.
    expect(hub).not.toContain("phoneSubnetOf");
    expect(hub).not.toContain("subnet: ");
    // The old inline pair inside the watcher is gone — the watcher calls the
    // one writer, so a second copy of the label logic cannot drift.
    expect(hub).not.toContain(
      "setPhoneNetworkLabel(\n        formatPhoneNetwork({",
    );
  });

  it("the formatter never prints 'name hidden' — nor a subnet mask", () => {
    expect(
      formatPhoneNetwork({ type: "wifi", connected: true, ssid: "Home" }),
    ).toBe("Wi-Fi · Home");
    // A still-unnamed network says what it is. It never prints the mask
    // ("Wi-Fi · 192.168.245.0/24") — the owner's 2026-10-25 ruling — and
    // never the old non-answer.
    const unnamed = formatPhoneNetwork({
      type: "wifi",
      connected: true,
      ssid: null,
    });
    expect(unnamed).toBe("Wi-Fi");
    expect(unnamed).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(unnamed).not.toContain("name hidden");
    expect(unnamed).not.toContain("name not shared");
    // The chip still starts with "Wi-Fi" — that is what gates the one
    // permission ask in the hub.
    expect(unnamed.startsWith("Wi-Fi")).toBe(true);
    // The honest states around it still hold.
    expect(
      formatPhoneNetwork({ type: "none", connected: false, ssid: null }),
    ).toBe("No network");
    expect(
      formatPhoneNetwork({ type: "cellular", connected: true, ssid: null }),
    ).toBe("Cellular");
  });
});
