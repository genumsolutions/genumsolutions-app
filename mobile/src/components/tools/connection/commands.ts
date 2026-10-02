// =====================================================================
// connection/commands — the router requests, AND the car's answers.
//
// The defect this exists to kill (D2, owner report: *"the adding the new
// router is not working"*):
//
//   The car answers every router command — `ROUTERS;ADDED`, `ROUTERS;USED`,
//   `ROUTERS;DELETED`, `ROUTERS;CLEARED`, `ROUTERS;FULL`,
//   `ROUTERS;ERROR;Reserved`, `ROUTERS;ERROR;Not saved:<ssid>`,
//   `ROUTERS;ERROR;Password too long`. The app parsed `REPLY=` off the
//   STATE line and then THREW IT AWAY: the only consumer matched
//   `WIFICFG;*`. Every router command was fire-and-forget, so a successful
//   add and a `ROUTERS;FULL` looked identical, and the form cleared itself
//   on a 600 ms timer.
//
// So: an answer that arrives must be CONSUMED, matched to the request that
// caused it, and turned into an outcome the user sees (F-62). An answer
// that never arrives must time out into a visible failure — never into a
// fake success.
//
// The wire grammar itself is NOT re-implemented here: the lines come from
// `carProtocol.buildRouterCommand`, the single place the grammar lives
// (F-51's lesson — a forked grammar is how `/f` vs `/forward` happened).
// This module owns the REQUEST model, the ANSWER parser and the OUTCOME.
//
// Pure. Pinned by commands.test.ts.
// =====================================================================

import { buildRouterCommand } from "../../../services/carProtocol";

import { isOwnApName, type RouterEntry, switchableRouters } from "./routerList";

export type RouterRequest =
  | { kind: "list" }
  | { kind: "scan" }
  | { kind: "add"; ssid: string; pass: string }
  | { kind: "use"; ssid: string }
  | { kind: "del"; ssid: string }
  | { kind: "clear" };

/** The exact bytes for a request. Delegates to the one grammar owner. */
export function routerRequestLine(r: RouterRequest): string {
  switch (r.kind) {
    case "list":
      return buildRouterCommand("LIST", "");
    case "scan":
      return buildRouterCommand("SCAN", "");
    case "clear":
      return buildRouterCommand("CLEAR", "");
    case "add":
      return buildRouterCommand("ADD", r.ssid, r.pass);
    case "use":
      return buildRouterCommand("USE", r.ssid);
    case "del":
      return buildRouterCommand("DEL", r.ssid);
  }
}

/**
 * Short human label for a request — used in "waiting for the car…" text and
 * in the log of what was attempted, so a failure always names its step.
 */
export function routerRequestLabel(r: RouterRequest): string {
  switch (r.kind) {
    case "list":
      return "read the car's routers";
    case "scan":
      return "scan for nearby networks";
    case "add":
      return `save "${r.ssid}" on the car`;
    case "use":
      return `switch the car to "${r.ssid}"`;
    case "del":
      return `remove "${r.ssid}"`;
    case "clear":
      return "clear all routers";
  }
}

// ---------------------------------------------------------------------
// The car's answers
// ---------------------------------------------------------------------

export type RouterAnswer =
  /** `ROUTERS;<ownAP>;<ssid>…` — the full saved list. */
  | { kind: "list"; ssids: string[] }
  | { kind: "added"; ssid: string }
  | { kind: "used"; ssid: string }
  | { kind: "deleted"; ssid: string }
  | { kind: "cleared" }
  | { kind: "full" }
  | { kind: "error"; code: string; detail: string };

/**
 * Parse the text of a `ROUTERS;…` answer.
 *
 * Returns `null` for anything that is not a router answer, so a caller can
 * feed every inbound line through this without pre-filtering — and a missing
 * shape is never mistaken for an empty list.
 */
/** The verbs the firmware uses as COMMANDS. Anything else after `ROUTERS;`
 *  is a saved-router NAME, i.e. the list reply. */
const ROUTER_VERBS: ReadonlySet<string> = new Set([
  "LIST",
  "SCAN",
  "ADD",
  "USE",
  "DEL",
  "CLEAR",
  "ADDED",
  "USED",
  "DELETED",
  "CLEARED",
  "FULL",
  "ERROR",
]);

export function parseRouterAnswer(text: string): RouterAnswer | null {
  const t = (text ?? "").trim();
  if (!t.toUpperCase().startsWith("ROUTERS")) return null;
  const parts = t.split(";").map((s) => s.trim());
  const verb = (parts[1] ?? "").toUpperCase();

  // The list reply is `ROUTERS;<ownAP>;<ssid>…` — the own AP first, then
  // the saved routers — and a bare `ROUTERS` when the registry is empty. The
  // saved names are NOT verbs, so an unrecognised second field means "this is
  // the list", not "I do not understand this".
  if (verb === "" || verb === "LIST" || !ROUTER_VERBS.has(verb)) {
    return { kind: "list", ssids: parts.slice(1).filter(Boolean) };
  }
  switch (verb) {
    case "ADDED":
      return { kind: "added", ssid: parts[2] ?? "" };
    case "USED":
      return { kind: "used", ssid: parts[2] ?? "" };
    case "DELETED":
      return { kind: "deleted", ssid: parts[2] ?? "" };
    case "CLEARED":
      return { kind: "cleared" };
    case "FULL":
      return { kind: "full" };
    case "SCAN":
      // The car's scan answer. Absent from every shipped binary so far, but
      // parsed so the shape is pinned before the firmware lands (D3).
      return { kind: "list", ssids: parts.slice(2).filter(Boolean) };
    case "ERROR": {
      // The firmware packs the offending ssid onto the code with a colon:
      // `ROUTERS;ERROR;Not saved:HomeNet`. Split it so `outcomeFor` can
      // match on the code alone and still show the name.
      const raw = parts[2] ?? "";
      const colon = raw.indexOf(":");
      return colon >= 0
        ? {
            kind: "error",
            code: raw.slice(0, colon).trim(),
            detail: raw.slice(colon + 1).trim(),
          }
        : { kind: "error", code: raw.trim(), detail: "" };
    }
    default:
      return null;
  }
}

/**
 * The scan answer, when the car supports it. Separate from `parseRouterAnswer`
 * because a scan result is DATA, not an outcome — it must not be mistaken
 * for the acknowledgement of a pending command.
 *
 * The firmware answers a scan either as a `SCAN;<ssid>,<rssi>,<open>;…`
 * line or as a `"scan":[…]` array in the status JSON.
 */
export type ScannedNetwork = { ssid: string; rssi: number; open: boolean };

export function parseScanLine(line: string): ScannedNetwork[] | null {
  const t = (line ?? "").trim();
  if (!t.toUpperCase().startsWith("SCAN;")) return null;
  const body = t.slice("SCAN;".length);
  if (body.toUpperCase() === "NONE") return [];
  const out: ScannedNetwork[] = [];
  for (const item of body.split(";")) {
    const [ssid, rssi, open] = item.split(",");
    const name = (ssid ?? "").trim();
    if (!name) continue;
    const n = Number(rssi);
    out.push({
      ssid: name,
      rssi: Number.isFinite(n) ? n : -100,
      open: String(open ?? "1").trim() !== "0",
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Outcome: what the user is told
// ---------------------------------------------------------------------

export type RouterOutcome =
  { ok: true; message: string; ssid?: string } | { ok: false; reason: string };

const ERROR_REASONS: Readonly<Record<string, string>> = {
  Reserved:
    "That name is the car's own network, so it cannot be saved as a router.",
  "Password too long":
    "That password is too long for the car. Try a shorter one.",
  "SSID length": "That router name is too long for the car. Try a shorter one.",
  Syntax:
    "The car did not understand the request. Its firmware may be older than " +
    "this app — flash the car to the latest version.",
};

/**
 * Turn the car's answer into what the user is shown.
 *
 * Every error code the firmware can emit has a readable reason. `Syntax` is
 * the important one: it is what an old binary says to a command it does not
 * have, so it names the flash instead of shrugging.
 */
export function outcomeFor(
  answer: RouterAnswer,
  request: RouterRequest,
): RouterOutcome {
  switch (answer.kind) {
    case "error": {
      // `Not saved:<ssid>` carries the ssid in `detail`.
      if (/^Not saved/i.test(answer.code)) {
        return {
          ok: false,
          reason: `The car does not have that router saved yet. Add it first.`,
        };
      }
      if (answer.code === "Could not add router") {
        return { ok: false, reason: "The car could not store that router." };
      }
      return {
        ok: false,
        reason:
          ERROR_REASONS[answer.code] ?? `The car refused: ${answer.code}.`,
      };
    }
    case "full":
      return {
        ok: false,
        reason:
          "The car already has the maximum number of routers. Delete one first.",
      };
    case "list":
      return { ok: true, message: "Read the car's routers." };
    case "added":
      return {
        ok: true,
        ssid: answer.ssid,
        message: `Saved "${answer.ssid}".`,
      };
    case "used":
      return {
        ok: true,
        ssid: answer.ssid,
        message: `The car is joining "${answer.ssid}".`,
      };
    case "deleted":
      return {
        ok: true,
        ssid: answer.ssid,
        message: `Removed "${answer.ssid}".`,
      };
    case "cleared":
      return { ok: true, message: "Cleared every saved router." };
  }
}

/** What to show when the car simply never answered (F-62: never fake success). */
export function timeoutOutcome(request: RouterRequest): RouterOutcome {
  return {
    ok: false,
    reason:
      `The car did not answer when asked to ${routerRequestLabel(request)}. ` +
      "Check the link is still up, then try again.",
  };
}

// ---------------------------------------------------------------------
// The switch plan
// ---------------------------------------------------------------------

export type SwitchPlan = {
  /** The SSID the car should end up on. */
  readonly target: string;
  /** Commands in the order they must go out. `add` precedes `use`. */
  readonly steps: readonly RouterRequest[];
};

/**
 * The commands that make the car join `target`, in order.
 *
 * The car needs the pair stored before it will use it: `ROUTERS;USE` on a
 * router it has never stored is answered `ROUTERS;ERROR;Not saved:<ssid>`
 * (that is `cd3158f` territory — the on-the-fly add lives in the firmware,
 * but the app must not rely on it, and must not send a USE it knows will be
 * refused).
 *
 * An `add` is included when the car does not already have the router, or when
 * a password was typed (an edit re-ADDs — the firmware treats ADD as an
 * upsert by SSID).
 *
 * Refuses the car's own network outright, with the same reason the firmware
 * gives: asking to "switch" to the network the car is already on its default
 * is how D1 destroyed stored credentials.
 */
export function planSwitch(input: {
  target: string;
  pass?: string | null;
  entries: readonly RouterEntry[];
  ownApName?: string | null;
}): SwitchPlan | null {
  const target = input.target.trim();
  if (!target) return null;
  if (
    isOwnApName(target) ||
    target.toUpperCase() === (input.ownApName ?? "").trim().toUpperCase()
  ) {
    return null;
  }
  const known = switchableRouters(input.entries).some(
    (e) => e.ssid.toUpperCase() === target.toUpperCase(),
  );
  const pass = (input.pass ?? "").trim();
  const steps: RouterRequest[] = [];
  if (!known || pass.length > 0) {
    steps.push({ kind: "add", ssid: target, pass });
  }
  steps.push({ kind: "use", ssid: target });
  return { target, steps };
}
