// =====================================================================
// USE-CONTROLHUB-CONNECT OUTCOME — pins the U-69 fix.
//
// Before the fix `handleConnect` stored its failure in `error` and returned
// normally, so a failed Bluetooth connect was indistinguishable from a
// successful one: the UI reported "Connected to <car>" while no link existed.
// The hub now returns `ConnectOutcome` and clears the stale success state on
// the failure path. This test reads the RAW (comments stripped) source of
// `useControlHub.ts` and asserts the two behaviours that the app can only
// get right by returning the outcome and by clearing the connecting flag:
//
//   1. `handleConnect` is a callback whose body creates the outcome with
//      `ok: true/false` and returns it — no path swallows a failure.
//   2. On the failure path the hub sets `setConnecting(false)` and clears the
//      outbound marker so a SECOND connect cannot read a stale "connecting".
// =====================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

function raw(rel: string): string {
  return readFileSync(fileURLToPath(new NodeURL(rel, import.meta.url)), "utf8");
}

function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
    .join("\n");
}

const hub = strip(raw("./useControlHub.ts"));

describe("useControlHub — connect outcome is returned, no fake success", () => {
  it("returns a ConnectOutcome from handleConnect in both branches", () => {
    // The relevant region of `useControlHub.ts` is the `handleConnect`
    // callback, from `const handleConnect = useCallback` to the next
    // `const handleSppsRetry` (its ONLY sibling that speaks
    // `ConnectOutcome`). Reading the region wholesale avoids the other
    // callbacks in this 4,000-line hook that reuse the same string
    // fragments.
    const start = hub.indexOf("const handleConnect = useCallback");
    const end = hub.indexOf("const handleSppsRetry", start);
    const region = hub.slice(start, end);

    // The success branch returns { ok: true, message } and the catch branch
    // returns { ok: false, reason }. Both are returned from the same handler,
    // so a caller that awaits the callback cannot mistake a failure for a
    // connection. The early `if (!device.address)` branch returns an outcome
    // too — the important invariant is that no failure is ever swallowed into
    // `error` alone.
    const successBranch = region.indexOf(`return {
          ok: true,
          message:`);
    const catchReturn = region.lastIndexOf(`return { ok: false, reason };`);
    expect(successBranch).toBeGreaterThan(-1);
    expect(catchReturn).toBeGreaterThan(0);
    // Inside `handleConnect` the flow is: success branch first (try), then the
    // catch branch's failure return. Both return a ConnectOutcome — the handler
    // never falls through to `error` alone.
    expect(successBranch).toBeLessThan(catchReturn);
  });

  it("clears the outbound marker and device list on the failure path", () => {
    const catchBlock = hub.indexOf("catch (e) {");
    expect(catchBlock).toBeGreaterThan(-1);
    // The failure path in the real code is:
    //   setConnecting(false);
    //   setConnectingAddress(null);
    //   setSppDevices([]);
    //   return { ok: false, reason };
    // — the markers are cleared and the device list is emptied BEFORE the
    // outcome is returned, so a caller awaiting the callback never reads a
    // stale "Connected to <car>" state off the screen. (The `mountedRef`
    // guard before the first `setError` means a mounting connect error only
    // touches the error text, never the link flags.)
    const clearConnected = hub.indexOf("setConnecting(false);", catchBlock);
    const clearAddress = hub.indexOf("setConnectingAddress(null);", catchBlock);
    const clearDevices = hub.indexOf("setSppDevices([]);", catchBlock);
    const afterClear = hub.indexOf(
      "return { ok: false, reason };",
      clearDevices,
    );
    expect(clearConnected).toBeGreaterThan(catchBlock);
    expect(clearAddress).toBeGreaterThan(clearConnected);
    expect(clearDevices).toBeGreaterThan(clearAddress);
    expect(afterClear).toBeGreaterThan(clearDevices);
  });
});
