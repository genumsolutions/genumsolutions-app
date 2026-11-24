// =====================================================================
// S-07 (owner bench report 2026-11-24): "reset car should clear the holding
// values and show the defaults after boot".
//
// The first 3.4.7 cut of resetCarData() only wiped AsyncStorage and the
// transport toggles, so after a factory reset the panel still showed the last
// held speed / servo / steer limit / trim / mode while the car had booted to
// its defaults — the two disagreed until every control was nudged.
//
// WHY THIS READS SOURCE (F-83): there is no component test harness in this
// repo (no React Testing Library — see the note in ../oneActiveLink.test.ts
// and persistenceSync.test.ts), so the hook cannot be rendered. The rule is
// pinned as: (a) the reset clears every holding value, (b) with the SAME
// defaults the hook's own useState declarations start from, so the panel
// agrees with a freshly booted car, and (c) it forgets the drive-setup
// adoption gate so the next link re-adopts instead of pushing stale values.
// =====================================================================

import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";
import { readSource } from "../../../test-utils/readSource";

const RAW = readSource(
  fileURLToPath(new NodeURL("./useControlHub.ts", import.meta.url)),
);

/** Comments stripped, string literals KEPT (the URL-literal sanitiser used by
    the sibling persistenceSync pin). */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
  .join("\n");

describe("S-07 — reset car clears the holding values", () => {
  it("has sources to check (the rules must not pass vacuously)", () => {
    expect(RAW.length).toBeGreaterThan(10000);
    expect(code).toContain("const resetCarData = useCallback(");
    expect(code).toContain("FACTORY_RESET_LINE");
  });

  it("still tells the car to factory-reset over every live link", () => {
    const at = code.indexOf("const resetCarData = useCallback(");
    expect(at).toBeGreaterThan(0);
    const block = code.slice(at, at + 1200);
    expect(block).toContain("sppService.sendLine(FACTORY_RESET_LINE)");
    expect(block).toContain("wifiService.sendLine(FACTORY_RESET_LINE)");
    expect(block).toContain("bleService.sendLine(FACTORY_RESET_LINE)");
  });

  it("clears every holding value with the boot defaults", () => {
    const at = code.indexOf("const resetCarData = useCallback(");
    const block = code.slice(at, at + 4000);
    // the same values the hook's useState declarations boot with
    expect(block).toContain("setSpeed(170);");
    expect(block).toContain("setServo(90);");
    expect(block).toContain("setSteerLimit(STEER_LIMIT_DEFAULT);");
    expect(block).toContain("setTrim(0);");
    expect(block).toContain("setActiveMode(LOCAL_CAR_MODES[0]);");
    expect(block).toContain("setTripAvg(0);");
    expect(block).toContain("setMaxSteer(0);");
    expect(block).toContain('setDriveStatus("Stop");');
    expect(block).toContain('setDriveDir("S");');
  });

  it("the cleared values are the ones the hook boots with (no drift)", () => {
    // If a boot default changes, the reset must change with it — otherwise the
    // panel shows numbers the freshly reset car is not running.
    expect(code).toContain("const [speed, setSpeed] = useState(170);");
    expect(code).toContain("const [servo, setServo] = useState(90);");
    expect(code).toContain(
      "const [steerLimit, setSteerLimit] = useState(STEER_LIMIT_DEFAULT);",
    );
    expect(code).toContain("const [trim, setTrim] = useState(0);");
    expect(code).toContain(
      "const [activeMode, setActiveMode] = useState<CarMode>(LOCAL_CAR_MODES[0]);",
    );
  });

  it("forgets the drive-setup adoption gate so the next link re-adopts", () => {
    // Otherwise the first connect after a reset would push the app's values
    // onto the car before the car's own boot values were adopted (S-05/S-06).
    const at = code.indexOf("const resetCarData = useCallback(");
    const block = code.slice(at, at + 4000);
    expect(block).toContain("setupAdoptedRef.current = false;");
  });

  it("reports a failure instead of pretending the reset happened", () => {
    const at = code.indexOf("const resetCarData = useCallback(");
    const block = code.slice(at, at + 4500);
    expect(block).toContain("return { ok: true };");
    expect(block).toContain("ok: false,");
    expect(block).toContain(
      'error: e instanceof Error ? e.message : "Reset failed",',
    );
  });
});
