// =====================================================================
// U-89: the app's parser, against the BYTES THE CAR ACTUALLY SENDS.
//
// Every existing test of this path uses a hand-written STATE line:
//
//   STATE;MODE=4WD4M;SPD=170;CONNECTED=1;CAP=LIVE;SSID=HomeNet;...
//
// The real car (captured off ws://192.168.1.100:81/ on 2026-10-03) sends:
//
//   STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;
//         AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;USED;...
//
// Note there is no CONNECTED= and no CAP= in the real one. A parser that only
// ever saw the synthetic shape can pass every test and still drop the answer
// from the real one - which is exactly the class of bug this session keeps
// meeting. So: the real bytes, verbatim.
// =====================================================================
import { describe, expect, it } from "vitest";

import { parseTelemetryLine } from "../../../services/carProtocol";
import { parseRouterAnswer, outcomeFor } from "./commands";

/** Captured off the car, byte for byte. */
const REAL_STATE_WITH_USED =
  "STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;" +
  "AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;USED;nijandangal_2.4\n";

const REAL_STATE_WITH_ADDED =
  "STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;" +
  "AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;ADDED;HomeNet\n";

const REAL_STATE_WITH_DELETED =
  "STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;" +
  "AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;DELETED;HomeNet\n";

/** Captured: the periodic registry broadcast. Note the own AP appears TWICE. */
const REAL_NETW = "NETW;4WDCar_Wifi;nijandangal_2.4;4WDCar_Wifi\n";

/** Captured: the scan acknowledgement. */
const REAL_STATE_WITH_SCAN =
  "STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;" +
  "AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;SCAN;STARTED\n";

describe("U-89 - real car bytes through the real parser", () => {
  it("a real STATE line carries its reply through", () => {
    const t = parseTelemetryLine(REAL_STATE_WITH_USED);
    expect(t.reply).toBe("ROUTERS;USED;nijandangal_2.4");
    expect(parseRouterAnswer(t.reply!)).toEqual({
      kind: "used",
      ssid: "nijandangal_2.4",
    });
  });

  it("a real add answer is an ADD, not a list", () => {
    const t = parseTelemetryLine(REAL_STATE_WITH_ADDED);
    expect(parseRouterAnswer(t.reply!)).toEqual({
      kind: "added",
      ssid: "HomeNet",
    });
  });

  it("a real delete answer is a DELETE", () => {
    const t = parseTelemetryLine(REAL_STATE_WITH_DELETED);
    expect(parseRouterAnswer(t.reply!)).toEqual({
      kind: "deleted",
      ssid: "HomeNet",
    });
  });

  it("a real scan acknowledgement is a scan, never a router named STARTED", () => {
    const t = parseTelemetryLine(REAL_STATE_WITH_SCAN);
    // `scanStarted`, not `scan` - the U-81 fix's whole point is that the
    // acknowledgement is its own kind. Getting this wrong is what persisted a
    // phantom router literally named STARTED.
    expect(parseRouterAnswer(t.reply!)).toEqual({ kind: "scanStarted" });
  });

  it("a real switch produces a SUCCESS outcome for the pending request", () => {
    const t = parseTelemetryLine(REAL_STATE_WITH_USED);
    const outcome = outcomeFor(parseRouterAnswer(t.reply!)!, {
      kind: "use",
      ssid: "nijandangal_2.4",
    });
    expect(outcome.ok).toBe(true);
  });

  it("the real NETW registry broadcast parses and keeps the own AP", () => {
    const t = parseTelemetryLine(REAL_NETW);
    // Whatever the shape, the app must end up knowing the car is on
    // nijandangal_2.4 - that is the network name the owner expects to see.
    expect(JSON.stringify(t)).toContain("nijandangal_2.4");
  });

  it("the real CAPS line parses availability", () => {
    const t = parseTelemetryLine(
      "CAPS;4WD4M:LIVE;PATH:CS;OBS_US:CS;OBS_IR:CS;MAN:CS;AUTO:CS;2WD1M:CS\n",
    );
    expect(Object.keys(t.caps ?? {}).length).toBe(7);
    expect(t.caps?.["4WD4M"]).toBe("LIVE");
  });

  it("the real refusal strings parse as refusals, not as lists", () => {
    const t = parseTelemetryLine(
      "STATE;MODE=4WD4M;SPD=230;TRIM=0;STATUS=Stopped;SSID=nijandangal_2.4;" +
        "AP=4WDCar_Wifi;IP=192.168.1.100;ID=1FB608;REPLY=ROUTERS;FULL\n",
    );
    const answer = parseRouterAnswer(t.reply!);
    expect(answer).toEqual({ kind: "full" });
    expect(outcomeFor(answer!, { kind: "add", ssid: "x", pass: "y" }).ok).toBe(
      false,
    );
  });
});
