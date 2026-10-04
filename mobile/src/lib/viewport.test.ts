// U-90 - the ONE responsive idiom, pinned. Before this module every screen
// derived its own threshold (RouterPanel's 640, RemoteControlScreen's own
// landscape compare) and HomeScreen froze its card width at module load —
// see viewport.ts. These tests pin the shared semantics so no future screen
// reintroduces a private threshold or a frozen read.
import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

// viewport.ts imports the hook from react-native; the mock replaces the Flow
// module (which rolldown cannot parse) for this pure-logic test file. The
// hook itself is exercised by tsc + the screens, not here.
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 0, height: 0 }),
}));

import {
  HOME_CARD_GAP,
  HOME_STRIP_PADDING_X,
  WIDE_BREAKPOINT,
  homeCardWidth,
  isLandscapeLayout,
  isWideLayout,
} from "./viewport";

describe("U-90 - isWideLayout: the single breakpoint", () => {
  it("unlocks two-column layouts at 640 (RouterPanel's existing sm)", () => {
    expect(WIDE_BREAKPOINT).toBe(640);
    expect(isWideLayout(640)).toBe(true);
    expect(isWideLayout(641)).toBe(true);
    expect(isWideLayout(768)).toBe(true);
  });

  it("keeps single-column below the breakpoint, inclusive edge", () => {
    expect(isWideLayout(639)).toBe(false);
    expect(isWideLayout(375)).toBe(false);
    expect(isWideLayout(0)).toBe(false);
  });
});

describe("U-90 - isLandscapeLayout: strictly wider than tall", () => {
  it("is true only when width exceeds height", () => {
    expect(isLandscapeLayout(844, 390)).toBe(true);
    expect(isLandscapeLayout(390, 844)).toBe(false);
  });

  it("counts square as portrait (no accidental landscape layout)", () => {
    expect(isLandscapeLayout(500, 500)).toBe(false);
  });
});

describe("U-90 - homeCardWidth: the U-47v5 two-cards-per-viewport rule, reactive", () => {
  it("splits the viewport into two cards minus the side padding and the gap", () => {
    // 390-wide phone: (390 - 2*20 - 12) / 2 = 169
    expect(homeCardWidth(390)).toBe(169);
    // 375-wide phone: (375 - 52) / 2 = 161.5
    expect(homeCardWidth(375)).toBe(161.5);
  });

  it("grows with the viewport instead of freezing at import time", () => {
    // The old module-level constant froze at the first device's width; on a
    // 1024 web window the cards must be wider, not portrait-sized.
    expect(homeCardWidth(1024)).toBeGreaterThan(homeCardWidth(390));
    expect(homeCardWidth(1024)).toBe(486);
  });

  it("keeps the U-47v5 spacing constants the carousels snap to", () => {
    expect(HOME_STRIP_PADDING_X).toBe(20);
    expect(HOME_CARD_GAP).toBe(12);
    // Snap interval = card + gap, two cards + gap + padding == viewport:
    const w = 390;
    expect(
      homeCardWidth(w) * 2 + HOME_CARD_GAP + HOME_STRIP_PADDING_X * 2,
    ).toBe(w);
  });
});

describe("U-90 - the module itself never freezes a viewport read", () => {
  // The whole point of U-90: no module-load Dimensions.get. The hook derives
  // everything from the reactive useWindowDimensions, so a source-level ban
  // on the static read in THIS file keeps the idiom honest.
  it("contains no static Dimensions.get", () => {
    const src = readFileSync(
      fileURLToPath(new NodeURL("./viewport.ts", import.meta.url)),
      "utf8",
    );
    // Strip comments first: the rule bans the frozen READ, not talking about it.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code.includes("Dimensions.get")).toBe(false);
  });
});
