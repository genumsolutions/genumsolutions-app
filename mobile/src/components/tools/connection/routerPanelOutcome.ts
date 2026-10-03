// =====================================================================
// U-81: WHAT THE ROUTER PANEL SHOWS, AND WHETHER IT CLEARS ITS FORM.
//
// The Remote screen's `RouterPanel` was still wired to the pre-U-68
// optimistic pair (`routerUse` / `routerAdd`). Those send a line and then
// assume it worked, so a REFUSED answer and a SUCCESS are pixel-identical:
// the form cleared itself on a fixed 600 ms timer (`RouterPanel` handleAdd)
// and the row showed the new name because the app had already put it there
// itself. U-68 built the ack-consuming path (`requestRouter` / `runSwitchPlan`)
// and wired the Control Panel to it; this module is the missing half — the rule
// the shared panel applies to the answer it is finally given.
//
// The rule, stated once so it is checkable without mounting React:
//
//   1. The busy state ends when the CAR'S ANSWER arrives, never on a timer.
//      A timer is a guess; the answer is a fact (F-61).
//   2. The form clears ONLY on a confirmed success. A refusal must leave the
//      typed values in place so the user can correct them — and the password is
//      never echoed into any message on the way (W-14 / F-68).
//   3. A refusal is SHOWN. Silence is a visible failure (F-62), never a
//      fake success.
//
// Pure on purpose: the same shape is transcribed by `routerMemory.test.ts`,
// and a panel that can be reasoned about without a renderer is a panel whose
// rules cannot quietly rot.
// =====================================================================
import type { RouterOutcome } from "./commands";

export type PanelTone = "ok" | "error";

export type PanelOutcome = {
  tone: PanelTone;
  text: string;
  /** Clear the typed SSID/password — true ONLY when the car confirmed. */
  clearForm: boolean;
};

/** What the user was trying to do, so a silent outcome still reads as English. */
export type RouterVerb = "add" | "switch" | "delete" | "clear";

const DONE: Record<RouterVerb, string> = {
  add: "Router saved on the car.",
  switch: "Switched.",
  delete: "Router removed from the car.",
  clear: "Saved routers cleared.",
};

/**
 * Turn a consumed answer into what the panel renders.
 *
 * `message` from the car wins when present (it is the car's own words); the
 * verb is the fallback so a bare `{ ok: true }` is still not a blank card.
 */
export function panelOutcomeFor(
  outcome: RouterOutcome,
  verb: RouterVerb,
): PanelOutcome {
  if (outcome.ok) {
    const text = outcome.message?.trim();
    return {
      tone: "ok",
      text: text ? text : DONE[verb],
      clearForm: true,
    };
  }
  const reason = outcome.reason?.trim();
  return {
    tone: "error",
    text: reason
      ? reason
      : "The car did not confirm that. Nothing was changed.",
    clearForm: false,
  };
}
