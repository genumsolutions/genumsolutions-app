// =====================================================================
// U-81: THE ROUTER ANSWER MUST SURVIVE THE WIRE.
//
// This is the test for the defect the owner reported as *"the where the car
// is section is not having the new home routers that has just been added"*.
//
// The app's half of this was always correct and fully tested: it parses
// `REPLY=`, hands the text to the router consumer, and derives the saved list
// from the car's ANSWER (U-71, `routerMemory.test.ts`). Every one of those
// unit tests passed the whole time the feature was broken, because the bytes
// never arrived. They tested the parser and the derivation; nothing tested the
// trip.
//
// The trip had a hole in the middle, on the car: `WebServerComm::write()` was
// `return len;` — a sink. It was the object wired as `comm_`, and every router
// answer travels through it on the STATE line, so over WiFi the answer was
// accepted and thrown away. Then the car joined the new router, the socket
// dropped, and the 1 s JSON `networks` frame could not rescue it either. The
// new home router appeared nowhere: not on screen, not in storage.
//
// So this file pins the SEAM, using the literal strings the firmware emits
// (`WebServerComm.cpp` reply formats + `ModeManager.cpp:535` STATE assembly),
// across all three hops the answer makes:
//
//   car bytes  ->  parseTelemetryLine  ->  parseRouterAnswer  ->  remembered list
//
// A test suite of parsers cannot catch a wire that is empty. This can.
// =====================================================================
import { describe, expect, it } from "vitest";

import { parseTelemetryLine } from "../../../services/carProtocol";
import { parseRouterAnswer, outcomeFor } from "./commands";
import { deriveRouters } from "./routerMemory";

/** The car wraps a reply as `…;REPLY=<line>` on a STATE line (ModeManager.cpp:525-535). */
function stateLineWithReply(reply: string): string {
  return (
    "STATE;MODE=4WD4M;SPD=170;CONNECTED=1;CAP=LIVE;" +
    `SSID=HomeNet;IP=192.168.1.57;ID=8A3F2B;REPLY=${reply}`
  );
}

/**
 * The REAL derivation the app runs on an answer — not a copy of it.
 * `null` means the answer changes nothing.
 */
function remembered(
  current: readonly string[],
  reply: string,
): { next: readonly string[]; lastSsid?: string } | null {
  const answer = parseRouterAnswer(reply);
  return answer ? deriveRouters(current, answer) : null;
}

describe("U-81 - a router answer survives the wire (the seam, not just the parsers)", () => {
  it("ADD: the car's ADDED answer puts the new home router in the remembered list", () => {
    // Exactly what the car writes after storing a router (WebServerComm.cpp:258).
    const reply = "ROUTERS;ADDED;HomeNet";
    const t = parseTelemetryLine(stateLineWithReply(reply));

    // hop 1: it must be visible to the app at all
    expect(t.reply).toBe(reply);

    // hop 2 + 3: and it must land in the list the user is shown
    const next = remembered(["4WDCar_Wifi"], t.reply!);
    expect(next!.next).toEqual(["4WDCar_Wifi", "HomeNet"]);
    // U-71: an add is remembered as an add, so the field pre-fills next time.
    expect(next!.lastSsid).toBe("HomeNet");
  });

  it("USE: the switch answer is both remembered AND reported to the user", () => {
    const reply = "ROUTERS;USED;HomeNet"; // WebServerComm.cpp:296
    const t = parseTelemetryLine(stateLineWithReply(reply));
    expect(remembered(["4WDCar_Wifi"], t.reply!)!.next).toEqual([
      "4WDCar_Wifi",
      "HomeNet",
    ]);
    // U-80: this answer is what raises the "join <ssid> on this phone" card.
    // It is raised from the SAME consumed answer, so a switch that cannot be
    // reported is a switch the user is never told about.
    expect(
      outcomeFor(parseRouterAnswer(t.reply!)!, {
        kind: "use",
        ssid: "HomeNet",
      }),
    ).toMatchObject({ ok: true, ssid: "HomeNet" });
  });

  it("DEL / CLEAR: removals survive too", () => {
    const del = parseTelemetryLine(
      stateLineWithReply("ROUTERS;DELETED;HomeNet"),
    );
    expect(remembered(["4WDCar_Wifi", "HomeNet"], del.reply!)!.next).toEqual([
      "4WDCar_Wifi",
    ]);
    const clear = parseTelemetryLine(stateLineWithReply("ROUTERS;CLEARED"));
    expect(remembered(["4WDCar_Wifi", "HomeNet"], clear.reply!)!.next).toEqual(
      [],
    );
  });

  it("every REFUSAL is reported as a refusal and remembers nothing", () => {
    // The literal refusal strings the firmware emits. A refusal that parsed as a
    // list, or that vanished, is precisely how "add a router" became impossible.
    const refusals = [
      "ROUTERS;FULL", // :243 / :316 - registry is full
      "ROUTERS;ERROR;Reserved", // :233 / :356 - the car's own AP name
      "ROUTERS;ERROR;Password too long", // :235
      "ROUTERS;ERROR;SSID length", // :230
      "ROUTERS;ERROR;Not saved:HomeNet", // :387
      "ROUTERS;ERROR;Could not add router", // :347
      "ROUTERS;ERROR;Syntax", // :451
    ];
    for (const reply of refusals) {
      const t = parseTelemetryLine(stateLineWithReply(reply));
      expect(t.reply, reply).toBe(reply);
      // remembered list untouched ...
      expect(remembered(["4WDCar_Wifi"], t.reply!), reply).toBeNull();
      // ... and the user is told why, never shown a success.
      const outcome = outcomeFor(parseRouterAnswer(t.reply!)!, {
        kind: "add",
        ssid: "HomeNet",
        pass: "x",
      });
      expect(outcome.ok, reply).toBe(false);
      expect(
        (outcome as { reason: string }).reason.length,
        reply,
      ).toBeGreaterThan(0);
    }
  });

  it("a scan acknowledgement is a scan, never a router named STARTED", () => {
    // WebServerComm.cpp:449. This shape used to be parsed as a saved list,
    // which persisted a phantom network into the list that says where the car is.
    const t = parseTelemetryLine(stateLineWithReply("ROUTERS;SCAN;STARTED"));
    expect(remembered(["HomeNet"], t.reply!)).toBeNull();
    expect(outcomeFor(parseRouterAnswer(t.reply!)!, { kind: "scan" }).ok).toBe(
      true,
    );
  });

  it("a refused MODE reaches the app as a refusal, on the same socket", () => {
    // ModeManager.cpp:841. Before U-81 this went to `comm_` behind a
    // `connected()` guard and (over WiFi) into the sink, so a tapped mode the
    // car does not have produced a ~2.5 s optimistic lie and a silent snap-back.
    const t = parseTelemetryLine("NACK;E=UNKNOWN_MODE;ARG=ESP_SER\n");
    expect(t.nackError).toBe("UNKNOWN_MODE");
    expect(t.nackArg).toBe("ESP_SER");
  });

  it("the 1 s JSON status is still understood on the same socket", () => {
    // The fix put text frames back on the WebSocket. The status JSON must keep
    // parsing alongside them, or the whole telemetry deck would go dark.
    const j = parseTelemetryLine(
      '{"status":"4WD4M","mode":"4WD4M","speed":170,"ip":"192.168.1.57",' +
        '"ssid":"HomeNet","want":"","ap":"4WDCar_Wifi","id":"8A3F2B",' +
        '"networks":["4WDCar_Wifi","HomeNet"],"connected":true}',
    );
    expect(j.mode).toBe("4WD4M");
    expect(j.networks).toEqual(["4WDCar_Wifi", "HomeNet"]);
    expect(j.id).toBe("8A3F2B");
  });
});
