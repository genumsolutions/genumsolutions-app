// =====================================================================
// U-81: the router panel's honesty rules, pinned.
//
// The defect this round closed: the Remote screen's `RouterPanel` sent a
// router command and then ASSUMED it worked. `handleAdd` cleared the form on a
// fixed 600 ms timer and showed "Saving…", so `ROUTERS;FULL`, `Reserved`,
// `Password too long`, `SSID length`, `Syntax` and a timeout all rendered
// exactly like a success — and the app had already written the name into its
// own list, so the row appeared even when the car refused it. That is F-62
// (consume the answer; silence is a visible failure) and F-61 (verify the
// device's truth) in their purest form, and it is the same class the Control
// Panel had already been repaired for in U-68 — the shared panel was simply
// never rewired.
//
// These pin the three rules the panel must never break again:
//   1. a confirmed success clears the form,
//   2. a REFUSAL keeps the form (so a typo can be corrected) and says why,
//   3. the car's own message wins, and the verb is only the fallback.
// =====================================================================
import { describe, expect, it } from "vitest";

import { panelOutcomeFor, type RouterVerb } from "./routerPanelOutcome";

const VERBS: readonly RouterVerb[] = ["add", "switch", "delete", "clear"];

describe("panelOutcomeFor", () => {
  it("clears the form ONLY when the car confirmed", () => {
    for (const verb of VERBS) {
      const ok = panelOutcomeFor({ ok: true, message: "Saved." }, verb);
      const refused = panelOutcomeFor({ ok: false, reason: "Too long." }, verb);
      expect(ok.clearForm).toBe(true);
      expect(refused.clearForm).toBe(false);
    }
  });

  it("shows the car's OWN words on success", () => {
    const out = panelOutcomeFor(
      { ok: true, message: "ROUTERS;ADDED;HomeNet" },
      "add",
    );
    expect(out.text).toBe("ROUTERS;ADDED;HomeNet");
    expect(out.tone).toBe("ok");
  });

  it("shows the REFUSAL reason on failure, never a success tone", () => {
    for (const reason of [
      "That name is the car's own network, so it cannot be saved as a router.",
      "That password is too long for the car. Try a shorter one.",
      "That router name is too long for the car. Try a shorter one.",
      "The car did not answer in time.",
    ]) {
      const out = panelOutcomeFor({ ok: false, reason }, "add");
      expect(out.tone).toBe("error");
      expect(out.text).toBe(reason);
    }
  });

  it("never renders a blank card — a bare ok/empty message still reads", () => {
    for (const verb of VERBS) {
      expect(
        panelOutcomeFor({ ok: true, message: "" }, verb).text.length,
      ).toBeGreaterThan(0);
      expect(
        panelOutcomeFor({ ok: true, message: "   " }, verb).text.length,
      ).toBeGreaterThan(0);
      const bare = panelOutcomeFor({ ok: false, reason: "" }, verb);
      expect(bare.text.length).toBeGreaterThan(0);
      expect(bare.clearForm).toBe(false);
    }
  });

  it("an UNCONFIRMED switch is an error, so a silent car cannot look like a move", () => {
    const out = panelOutcomeFor(
      { ok: false, reason: "Another router request was started." },
      "switch",
    );
    expect(out.tone).toBe("error");
    expect(out.clearForm).toBe(false);
  });

  it("never echoes a credential back through the message", () => {
    // W-14 / F-68: the typed password must not ride a status line. The panel
    // only ever renders what the CAR answered, and the car never repeats it.
    const out = panelOutcomeFor({ ok: true, message: "Router saved." }, "add");
    expect(out.text).not.toMatch(/pass|pw|secret/i);
  });
});
