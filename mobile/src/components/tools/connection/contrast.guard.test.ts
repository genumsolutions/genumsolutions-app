// =====================================================================
// contrast.guard.test.ts — the "fix the contrast FOR ONCE AND FOR ALL" guard.
//
// Owner, verbatim (2026-10-02): *"the text and the background are merging and
// the texts are not visible properly. please fix the contrast too for once and
// for all."*
//
// The diagnosis was a TOKEN problem, not a styling mistake:
//
//   This app's palette is a set of SEMANTIC tokens (ink, navy, sky, card,
//   muted, line, border, surface, gold…) and it defined NO error, success or
//   "selected" pair. So every failure surface reached for an OFF-PALETTE
//   Tailwind colour — text-red-600, bg-emerald-500/10, bg-sky-500/5,
//   text-sky-900. Off-palette colours do NOT flip with the theme: red-600 on a
//   white card is perfectly readable and red-600 on the dark card (#16223a) is
//   very nearly invisible. It looked fine in Light, broke in Dark, and read as
//   random text merging into its background.
//
// The fix added `danger`, `danger-soft`, `success`, `success-soft`,
// `select-bg` and `select-ink` to all THREE theme blocks in global.css (the
// `:root`/light pair, the OS-dark media block, and the `html[data-theme=dark]`
// block the manual toggle uses — the last of which outranks `:root`, so
// omitting it would have left manual-Dark users with light foregrounds on a
// dark card) plus tailwind.config.js.
//
// A one-off fix would drift back. This test makes the rule ENFORCED for this
// folder, which is the whole "for once and for all" ask:
//   1. no off-palette colour class may appear in a className;
//   2. the six U-69 tokens must exist in all three theme blocks AND in the
//      Tailwind config, so a rename cannot silently break a screen;
//   3. no `dark:` variant may be used to re-colour something — the tokens
//      already flip, and a `dark:` override is how a foreground drifts out of
//      sync with its background in one theme only.
//
// It reads the real files, so it fails on the next regression rather than
// describing an intention.
// =====================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONNECTION_METHODS } from "./methods";

const HERE = __dirname;
// connection -> tools -> components -> src -> mobile (the app root, where
// global.css and tailwind.config.js live).
const APP = join(HERE, "..", "..", "..", "..");

/** The semantic tokens this folder is allowed to paint with. */
const ALLOWED_TOKENS = [
  "ink",
  "navy",
  "navy-dark",
  "navy-light",
  "sky",
  "mist",
  "gold",
  "gold-dark",
  "line",
  "border",
  "surface",
  "card",
  "muted",
  "accent",
  // U-69 additions — the pair the palette was missing.
  "danger",
  "danger-soft",
  "success",
  "success-soft",
  "select-bg",
  "select-ink",
] as const;

/**
 * Off-palette colour families. Any `text-|bg-|border-|from-|to-|via-` utility
 * whose colour part starts with one of these is a raw Tailwind colour, which
 * does not flip with the theme.
 */
const RAW_COLOUR_PREFIXES = [
  "red",
  "emerald",
  "sky",
  "blue",
  "slate",
  "amber",
  "orange",
  "yellow",
  "green",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
  "cyan",
  "teal",
  "lime",
  "fuchsia",
];

function readFolderSources(): { file: string; text: string }[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ file: f, text: readFileSync(join(HERE, f), "utf8") }));
}

/** Only the className strings — a colour name in a comment is documentation. */
function classNameStrings(text: string): string[] {
  const out: string[] = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  // Template-literal classNames are built with ${...}; capture those too.
  const tpl = /className=\{`([^`]*)`\}/g;
  while ((m = tpl.exec(text))) out.push(m[1] ?? "");
  return out;
}

describe("U-69 contrast guard — the connection folder paints with tokens only", () => {
  const sources = readFolderSources();

  it("has sources to check (the guard must not pass vacuously)", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("uses NO off-palette colour in any className", () => {
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      for (const cls of classNameStrings(text)) {
        const parts = cls.split(/\s+/).filter(Boolean);
        for (const p of parts) {
          const colon = p.lastIndexOf(":");
          const bare = colon >= 0 ? p.slice(colon + 1) : p;
          const m =
            /^(?:text|bg|border|from|to|via|ring|shadow|fill|stroke)-(.+)$/.exec(
              bare,
            );
          if (!m) continue;
          const colour = (m[1] ?? "").split("/")[0] ?? "";
          if ((ALLOWED_TOKENS as readonly string[]).includes(colour)) continue;
          if (
            RAW_COLOUR_PREFIXES.some(
              (r) => colour === r || colour.startsWith(`${r}-`),
            )
          ) {
            offenders.push(`${file}: ${p}`);
          }
        }
      }
    }
    expect(
      offenders,
      `Off-palette colours do not flip with the theme — that is the "text and ` +
        `background merging" bug. Use a semantic token instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("uses no `dark:` variant — the tokens already flip, and that is the point", () => {
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      for (const cls of classNameStrings(text)) {
        if (cls.split(/\s+/).some((p) => p.startsWith("dark:"))) {
          offenders.push(`${file}: ${cls}`);
        }
      }
    }
    expect(
      offenders,
      "A `dark:` override re-colours one theme only, which is how a foreground " +
        "drifts out of sync with its background. Put the pair in global.css instead.",
    ).toEqual([]);
  });
});

describe("the U-69 token pair exists everywhere it must", () => {
  const css = readFileSync(join(APP, "global.css"), "utf8");
  const config = readFileSync(join(APP, "tailwind.config.js"), "utf8");

  const NEW_TOKENS = [
    "danger",
    "danger-soft",
    "success",
    "success-soft",
    "select-bg",
    "select-ink",
  ];

  it("every new token is defined in the LIGHT theme block", () => {
    for (const t of NEW_TOKENS) {
      expect(css, `${t} missing from :root/light`).toMatch(
        new RegExp(`--color-${t}:`),
      );
    }
  });

  it("every new token is defined in the OS-DARK media block", () => {
    const start = css.indexOf("prefers-color-scheme: dark");
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf("html[data-theme=", start);
    const block = css.slice(start, end > 0 ? end : undefined);
    for (const t of NEW_TOKENS) {
      expect(block, `${t} missing from the OS-dark block`).toMatch(
        new RegExp(`--color-${t}:`),
      );
    }
  });

  it("every new token is defined in the MANUAL-DARK block (it outranks :root)", () => {
    // Without this, an app the user switched to Dark BY HAND keeps the LIGHT
    // foregrounds on the dark card — the same merge, for a subset of users only.
    const start = css.indexOf('html[data-theme="dark"]');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);
    for (const t of NEW_TOKENS) {
      expect(block, `${t} missing from the manual-dark block`).toMatch(
        new RegExp(`--color-${t}:`),
      );
    }
  });

  it("every token is registered in tailwind.config.js", () => {
    for (const t of ALLOWED_TOKENS) {
      const key = t
        .replace(/-(\w)/g, (_m, c: string) => `-${c}`)
        .replace(/^(.)/, (m) => m);
      // The config writes `ink:` for ink and `"danger-soft":` for the hyphenated
      // ones; accept both spellings.
      const found = config.includes(`${key}:`) || config.includes(`"${key}":`);
      expect(found, `tailwind.config.js does not expose ${t}`).toBe(true);
    }
  });
});

describe("the offered methods still fit the owner's brief (regression net)", () => {
  it("exactly three methods, Bluetooth offering SPP only", () => {
    expect(CONNECTION_METHODS.map((m) => m.id)).toEqual([
      "bluetooth",
      "wifi",
      "internet",
    ]);
    expect(
      CONNECTION_METHODS.find((m) => m.id === "bluetooth")!.targets.map(
        (t) => t.id,
      ),
    ).toEqual(["bt-spp"]);
  });

  it("WiFi has exactly two targets, so it is the one method that needs a target dropdown", () => {
    expect(
      CONNECTION_METHODS.find((m) => m.id === "wifi")!.targets.length,
    ).toBe(2);
  });
});
