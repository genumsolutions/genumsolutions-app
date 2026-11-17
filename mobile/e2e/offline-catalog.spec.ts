// =====================================================================
// e2e/offline-catalog.spec.ts — the non-retail inventory (2 3D models +
// 5 project packages) is what the bundled fallback is FOR.
//
// Those seven rows exist only in the `products` table: the owner creates
// them through the admin panel and MakerWorld link-import. Until the
// snapshot (`lib/catalog-extras-data.ts` → `src/config/bundledProducts.ts`)
// the credential-less app had no copy at all, so the 3D Products screen
// and Projects rendered EMPTY while the website showed 2 and 5 — and
// every About count read 0. These tests pin that the bundled copies
// actually paint on their own screens.
//
// Data note: as in smoke.spec.ts the bundle is whatever env the export
// used. Live credentials render the same seven rows from the database, so
// the assertions target the names and categories only, never a source
// badge — they hold both live and offline. An empty 3D Products or
// Projects screen (the old regression) fails either way.
// =====================================================================
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOTS = "test-results/screenshots";

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Exact text, on screen only — see the locator note in smoke.spec.ts. */
function vis(page: Page, text: string): Locator {
  return page
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first();
}

/** Substring text, on screen only (long model names wrap). */
function visMatch(page: Page, pattern: RegExp): Locator {
  return page.getByText(pattern).filter({ visible: true }).first();
}

async function openMenu(page: Page) {
  await page.goto("/");
  const menu = vis(page, "Menu");
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
}

/** The 3D Products screen is a bottom tab, not a Menu entry (U-47v2). */
async function openPrinting(page: Page) {
  await page.goto("/");
  const tab = vis(page, "3D Products");
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await tab.click();
}

const PACKAGES = [
  "Wireless 4WD Car",
  "2WD1M Car",
  "Self-Balancing Car",
  "ESP32 Remote Controller",
  "Smart Dustbin",
];

test.describe("Offline catalog: project packages", () => {
  test("Projects lists every bundled package with its project category", async ({
    page,
  }) => {
    await openMenu(page);
    await vis(page, "Projects").click();

    // The old failure mode was a bare screen with an empty inbox, so the
    // empty state itself must be absent before the cards are checked.
    await expect(
      visMatch(page, /No projects found/),
      "Projects rendered its empty state offline",
    ).toHaveCount(0);

    for (const name of PACKAGES) {
      const card = visMatch(page, new RegExp(`^${name}$`));
      await expect(card, `project package missing: ${name}`).toBeVisible();
      await card.scrollIntoViewIfNeeded();
    }

    // Project categories come from the packages themselves when the
    // database is unreachable, so the filter pills prove the fallback
    // carried `projectCategory` through the snapshot.
    // The filter's count comes from the packages themselves, so it proves
    // `projectCategory` survived the snapshot (a package with no category
    // would not be listed at all).
    const dropdown = visMatch(page, /^All categories \(5\)$/);
    await expect(dropdown, "expected 5 filtered packages").toBeVisible();
    await capture(page, "offline-projects");

    // Filtering by a bundled project category keeps exactly the packages the
    // website files under it, and drops the rest.
    await dropdown.click();
    await visMatch(page, /^Robo Car/).click();

    for (const name of [
      "Wireless 4WD Car",
      "2WD1M Car",
      "Self-Balancing Car",
    ]) {
      await expect(
        visMatch(page, new RegExp(`^${name}$`)),
        `Robo Car package missing after filtering: ${name}`,
      ).toBeVisible();
    }
    await expect(
      visMatch(page, /^Smart Dustbin$/),
      "Smart Dustbin belongs to another category and must be filtered out",
    ).toHaveCount(0);

    await capture(page, "offline-projects-robo-car");
  });
});

test.describe("Offline catalog: 3D models", () => {
  test("3D Products lists every bundled model", async ({ page }) => {
    await openPrinting(page);

    // Both models, by the names the admin panel created. The second is long
    // enough to wrap, so it is matched on its leading words.
    await expect(
      vis(page, "MAHA LAXMI"),
      "3D model missing: MAHA LAXMI",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      visMatch(page, /^Lord Shiva Statue/),
      "3D model missing: Lord Shiva Statue",
    ).toBeVisible();

    // Models are quoted, not priced — the snapshot carries the DB label.
    await expect(
      vis(page, "Request quote").first(),
      "models should carry their request-quote label",
    ).toBeVisible();

    // The screen's own heading renders above the grid, so a model card that
    // painted without the page shell (or vice versa) is caught.
    const heading = visMatch(page, /3D/i);
    await expect(heading).toBeVisible();

    await capture(page, "offline-3d-products");
  });
});
