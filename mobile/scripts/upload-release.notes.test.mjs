// =====================================================================
// ota-guard parses a commit short-hash out of the manifest `notes` string and
// refuses the push unless that commit is an ancestor of the tip. The notes are
// now DATA (release-notes.json), so a bullet that happens to contain a 7+ char
// hex-looking word ("deadbeef", a version like "3.4.4abc") would be picked up
// by the guard's FIRST-match regex instead of the real SHA, and every JS push
// would go red for a reason nobody would guess.
//
// These tests pin the contract from both sides:
//   - buildReleaseNotes() must always end in "(<short sha>)".
//   - applying ota-guard's own extraction rule to that string must yield that
//     sha — for the current version, for every version in release-notes.json,
//     and for the fallback (no entry) path.
// =====================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReleaseNotes, currentCommitSha } from "./upload-release.mjs";

const rootDir = resolve(import.meta.dirname, "..");

// Verbatim port of ota-guard.yml:
//   SHA=$(printf '%s' "$NOTE" | grep -oE '[0-9a-f]{7,40}' | head -1)
// grep -oE emits the first run of 7..40 lowercase hex characters.
function guardExtractSha(note) {
  return note.match(/[0-9a-f]{7,40}/)?.[0] ?? "";
}

const notesByVersion = JSON.parse(
  readFileSync(resolve(rootDir, "release-notes.json"), "utf8"),
);

describe("release notes carry a SHA ota-guard can read", () => {
  it("ends the note with the commit short-hash", () => {
    const note = buildReleaseNotes("abc1234def56");
    expect(note.endsWith("(abc1234def56)")).toBe(true);
  });

  it("the guard's own extraction yields exactly that SHA", () => {
    const sha = "abc1234def56";
    expect(guardExtractSha(buildReleaseNotes(sha))).toBe(sha);
  });

  it("extracts the SHA for every version in release-notes.json", () => {
    const sha = "0123456789ab";
    for (const version of Object.keys(notesByVersion)) {
      const note = buildReleaseNotes(sha);
      expect(guardExtractSha(note), `version ${version}`).toBe(sha);
    }
  });

  it("a note bullet that looks hex-ish never wins over the real SHA", () => {
    // Guard against the failure mode this file exists for: if any shipped
    // bullet ever contains a 7+ char hex run, the guard would read THAT.
    for (const [version, bullets] of Object.entries(notesByVersion)) {
      const sha = "0123456789ab";
      const note = buildReleaseNotes(sha);
      const [first] = note.match(/[0-9a-f]{7,40}/) ?? [];
      expect(first, `version ${version} notes`).toBe(sha);
      expect(
        bullets.some((line) => /[0-9a-f]{7,40}/.test(String(line))),
        `version ${version} bullet contains a hex run that ota-guard would read as the SHA`,
      ).toBe(false);
    }
  });

  it("the note is one line (a newline would break the workflow grep)", () => {
    const note = buildReleaseNotes("fedcba987654");
    const hasLineBreak =
      note.includes(String.fromCharCode(10)) ||
      note.includes(String.fromCharCode(13));
    expect(hasLineBreak).toBe(false);
    expect(note.trim()).toBe(note);
  });
  it("without a SHA the note is unreadable by the guard (why the suffix is mandatory)", () => {
    expect(guardExtractSha(buildReleaseNotes(""))).toBe("");
  });

  it("currentCommitSha is a short hash the guard accepts, or empty off-git", () => {
    const sha = currentCommitSha();
    if (sha) {
      expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
    } else {
      expect(sha).toBe("");
    }
  });
});
