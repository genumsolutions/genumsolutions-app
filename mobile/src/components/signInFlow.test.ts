// =====================================================================
// Sign-in flow regression guard (owner report, 2026-11-12):
//
//   "after just signed in the page of creating a new account opened up
//    which is not sensible … the create the new account form was weird
//    and confusing … the app didn't show the admin dashboard button as
//    the user logs in the admin account"
//
// Three things must not regress:
//   1. The sheet always opens on Sign in and closes the moment a session
//      lands — a signed-in user never lands on the create-account form.
//   2. Create account / Reset are one standard form each, reached by a
//      text link (no lingering tab bar that can be left on "Sign up").
//   3. Every staff role (staff / admin / owner) sees a direct Admin
//      dashboard entry in the app, same as the website header.
//
// Follows the repo's source-guard convention (see pageServingTruth.test.ts):
// the JSX is asserted from source because the vitest config runs in a plain
// node environment with no React Native renderer.
// =====================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function source(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

/** Comments stripped, so prose about a removed tab can't satisfy a check. */
function strip(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const sheet = strip(source("./SignInSheet.tsx"));
const account = strip(source("../screens/AccountScreen.tsx"));
const accountSheet = strip(source("./AccountSheet.tsx"));
const menu = strip(source("../screens/MenuScreen.tsx"));
const context = strip(source("../context/AppContext.tsx"));

describe("sign-in sheet never strands a signed-in user on create account", () => {
  it("hides itself while signed in and closes when a session lands", () => {
    expect(sheet).toContain("visible={visible && !isSignedIn}");
    expect(sheet).toContain("if (!visible || !isSignedIn) return;");
    const effectStart = sheet.indexOf("if (!visible || !isSignedIn) return;");
    const closeEffect = sheet.slice(effectStart, effectStart + 400);
    expect(closeEffect).toContain("resetForm();");
    expect(closeEffect).toContain("onRequestClose();");
  });

  it("always reopens on Sign in", () => {
    expect(sheet).toContain('if (visible) setMode("signin");');
    // The old three-tab bar (which could be left on "Sign up") is gone.
    expect(sheet).not.toContain('["signup", "Sign up"]');
    expect(sheet).not.toContain('["forgot", "Reset"]');
  });

  it("returns to Sign in after a sign-up that needs email confirmation", () => {
    const signupStart = sheet.indexOf("const result = await signUp(");
    const signupBlock = sheet.slice(signupStart, signupStart + 500);
    expect(signupBlock).toContain('switchMode("signin");');
    expect(signupBlock).toContain("Check your email to confirm it");
  });

  it("clears a stale auth error when switching forms", () => {
    const switchStart = sheet.indexOf("const switchMode");
    const switchBlock = sheet.slice(switchStart, switchStart + 500);
    expect(switchBlock).toContain("clearAuthError();");
    expect(context).toContain("clearAuthError: () => void;");
    expect(context).toContain("const clearAuthError = useCallback(");
  });
});

describe("staff roles get the Admin dashboard in the app", () => {
  it("the Account screen shows the entry for every staff role", () => {
    expect(account).toContain("{isStaff ? (");
    expect(account).toContain("Admin dashboard");
    expect(account).toContain('navigation.push("Admin")');
  });

  it("the account dropdown shows the entry and the role badge for staff", () => {
    expect(accountSheet).toContain("{isStaff && (");
    expect(accountSheet).toContain("Admin dashboard");
    expect(accountSheet).toContain(
      '{isOwner ? "Owner" : isAdmin ? "Admin" : "Staff"}',
    );
  });

  it("the Menu tab keeps its staff-only Admin group", () => {
    expect(menu).toContain("{isStaff ? (");
    expect(menu).toContain("Admin dashboard");
  });
});
