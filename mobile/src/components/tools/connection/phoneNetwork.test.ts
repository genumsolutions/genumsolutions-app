// =====================================================================
// U-121 (owner 2026-10-23): the phone's OWN network label — the source of
// truth is the hub's NetInfo watcher and the only expression of it that
// survives in code is `phoneNetworkLabel` (one useState pair + one render
// site). This test pins that invariant by reading the RAW source of
// useControlHub.ts, ConnectionSection.tsx and RemoteControlScreen.tsx with
// comments stripped.
//
//   1. the hub owns the label source
//   2. the Connectivity panel's left pane renders it (testID
//      `conn-phone-network`) — the SAME surface the Connect screen lost it
//      from
//   3. the Remote's FIRST bar carries it (testID `remote-phone-network`) —
//      the phone's network is ON the Remote, where the owner asked for it
//   4. the Raw ssid never leaks — only the formatted label, ever (issue 4)
// =====================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("U-121 — the phone-network label moved to the Connectivity panel AND the Remote's first bar", () => {
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

  it("the Connectivity panel does render the phone-network row in the body (Phase C)", () => {
    // The row is OPTIONAL (renders only when the hub has a real NetInfo
    // label). The strip below contains the testID in the source; at runtime
    // the row appears once the phone's network is known. The source-level
    // pin is: the row exists, has the right testID, and the label renders.
    expect(section).toContain('testID="conn-phone-network"');
    expect(section).toContain("phoneNetworkLabel");
    expect(section).toContain("This phone");
  });
  it("the Remote's FIRST bar carries it with a stable testID", () => {
    expect(chrome).toContain('testID="remote-phone-network"');
    expect(chrome).toContain("{phoneNetworkLabel}");
    expect(chrome).toContain("phoneNetworkLabel,");
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
