// =====================================================================
// e2e/smoke.spec.ts — the two screens whose sections were just added,
// rendered in a real browser at phone width.
//
// What these assert beyond "the text exists":
//   • the program sections sit BELOW the service grid, in the website's
//     order (a section that renders above the grid is wrong even though
//     every string is present);
//   • the About CTA row sits below the hero and every pill FITS the phone
//     width, so nothing is clipped off-screen;
//   • neither page scrolls sideways.
//
// Data note: the bundle is built from whatever env the local .env.local
// supplies. With credentials the screens show live DB rows; without them
// every read fails against the placeholder host and the bundled fallbacks
// paint instead. The assertions therefore only target strings that hold in
// BOTH cases — the section headings, the hardcoded NPR total, and the CTA
// labels — never a specific product or program name.
//
// Screenshot note: RN-Web's ScrollView scrolls an inner element, so the
// document itself never grows and `fullPage` captures only the viewport.
// Each section is therefore scrolled into view and captured separately.
//
// Locator note: React Navigation keeps every stack screen mounted, so
// HomeScreen's own "What GENUM does" / "Training programs" text is still in
// the DOM (hidden) while ServicesScreen is showing. Every locator here is
// therefore filtered to VISIBLE elements — `.first()` alone picks the
// hidden HomeScreen copy and fails.
// =====================================================================
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "test-results/screenshots";

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Exact text, on screen only. */
function vis(page: Page, text: string): Locator {
  return page
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first();
}

/** Pattern text, on screen only. */
function visMatch(page: Page, pattern: RegExp): Locator {
  return page.getByText(pattern).filter({ visible: true }).first();
}

/** The app boots on Home; Menu is a bottom tab. */
async function openMenu(page: Page) {
  await page.goto("/");
  const menu = vis(page, "Menu");
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
}

/** Open a stack screen from the Menu list. */
async function openViaMenu(page: Page, label: string) {
  await openMenu(page);
  const link = vis(page, label);
  await expect(link).toBeVisible();
  await link.click();
}

async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(
    box,
    "element exists but has no box — it did not lay out",
  ).not.toBeNull();
  return box!.y;
}

async function expectNoSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    scroll,
    `page scrolls sideways (${scroll}px content in ${client}px viewport)`,
  ).toBeLessThanOrEqual(client + 1);
}

test.describe("ServicesScreen layout", () => {
  test("renders the program sections below the service grid, in website order", async ({
    page,
  }) => {
    await openViaMenu(page, "Services");

    const heading = vis(page, "What GENUM does");
    await expect(heading).toBeVisible();

    const training = vis(page, "Training programs");
    const pilot = vis(page, "Illustrative pilot costing");
    const curriculum = vis(page, "100+ project curriculum");

    // Every section actually painted an element (not display:none / 0 height).
    for (const [name, locator] of [
      ["training programs", training],
      ["pilot costing", pilot],
      ["curriculum", curriculum],
    ] as const) {
      await expect(locator, `${name} is not visible`).toBeVisible();
    }

    // Content coming from the bundled fallbacks.
    await expect(visMatch(page, /NPR 8,40,000/)).toBeVisible();
    await expect(visMatch(page, /Outcome:/)).toBeVisible();

    // GUARD: a training-program title must have room to be READ. It used to
    // share its row with the duration pill and clamped to "K–5 Ro…" — about
    // 70 px wide — while still passing every "is it visible" check. 150 px is
    // roughly half the 390 px viewport, comfortably less than a full-width
    // title and far more than the truncated one.
    const titleBox = await page
      .getByText(/^K–5|^K-5|^STE|^Tea/)
      .filter({ visible: true })
      .first()
      .boundingBox();
    expect(titleBox, "no training title found").not.toBeNull();
    expect(
      Math.round(titleBox!.width),
      "training title is squeezed — is the duration pill sharing its row again?",
    ).toBeGreaterThan(150);

    // Vertical order: grid heading, then training, then pilot, then curriculum.
    const [yHeading, yTraining, yPilot, yCurriculum] = await Promise.all([
      topOf(heading),
      topOf(training),
      topOf(pilot),
      topOf(curriculum),
    ]);
    expect(
      yTraining,
      "training must be below the service grid",
    ).toBeGreaterThan(yHeading);
    expect(yPilot, "pilot costing must follow training").toBeGreaterThan(
      yTraining,
    );
    expect(yCurriculum, "curriculum must follow pilot costing").toBeGreaterThan(
      yPilot,
    );

    await expectNoSidewaysScroll(page);
    await capture(page, "services");

    // Capture each program section in place. A fullPage shot cannot reach
    // them (inner ScrollView), and "it passed an assertion" is not the same
    // as "it looks right".
    for (const [name, locator] of [
      ["services-training", training],
      ["services-pilot", pilot],
      ["services-curriculum", curriculum],
    ] as const) {
      await locator.scrollIntoViewIfNeeded();
      await capture(page, name);
    }
  });
});

test.describe("AboutScreen layout", () => {
  test("renders the hero, live stats and four fitting cross-link CTAs", async ({
    page,
  }) => {
    await openViaMenu(page, "About");

    const hero = vis(page, "Engineering with a reason to exist.");
    await expect(hero).toBeVisible();

    const LABELS = ["Shop components", "3D products", "Projects", "Open tools"];

    for (const label of LABELS) {
      const cta = vis(page, label);
      await expect(cta, `CTA missing: ${label}`).toBeVisible();

      const box = await cta.boundingBox();
      expect(box, `${label} has no box`).not.toBeNull();
      // The pill must fit the 390 px viewport — a clipped CTA is still
      // "visible" to Playwright, so check the geometry explicitly.
      expect(box!.x, `${label} starts off-screen`).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        `${label} runs ${Math.round(box!.x + box!.width)}px, past the 390px viewport`,
      ).toBeLessThanOrEqual(391);
    }

    // The CTA row belongs BELOW the hero, not overlapping it.
    const yHero = await topOf(hero);
    const yCta = await topOf(vis(page, "Shop components"));
    expect(yCta, "CTA row must sit below the hero").toBeGreaterThan(yHero);

    // The sections that follow must still be there, below the CTAs.
    const howWeWork = vis(page, "How we work");
    await expect(howWeWork).toBeVisible();
    expect(
      await topOf(howWeWork),
      "how-we-work must follow the CTA row",
    ).toBeGreaterThan(yCta);

    await expectNoSidewaysScroll(page);
    await capture(page, "about");
  });
});
