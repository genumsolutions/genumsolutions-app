// =====================================================================
// e2e/website-parity.spec.ts — the app and the website, rendered side by
// side, asserted against each other.
//
// The other specs check the app against its own expectations. This one
// checks it against the thing it is supposed to mirror: the same four live
// stats on /about (with the same NUMBERS, both read the same DB), and the
// same program-band headings in the same order on Home.
//
// Opt-in on purpose: it needs the website running, which the app repo's CI
// does not check out. Set WEBSITE_URL and it runs; otherwise it skips.
//
//   # terminal 1
//   cd genumsolutions-website && npm run dev       # http://127.0.0.1:3000
//   # terminal 2
//   cd genumsolutions-app/mobile
//   npm run test:e2e                                # builds + runs the app specs
//   WEBSITE_URL=http://127.0.0.1:3000 npx playwright test website-parity
// =====================================================================
import { expect, test, type Locator, type Page } from "@playwright/test";

const WEBSITE_URL = process.env.WEBSITE_URL;

/** The four rows the website's /about liveCounts publishes, in its order. */
const LIVE_LABELS = [
  "electronic components in store",
  "3D models printed on demand",
  "project packages & builds",
  "project categories supported",
];

/**
 * The program band the website's home page shows, in its order.
 *
 * Matched on prefixes so the assertions pin the ORDER and tolerate trailing
 * copy drift, but the second entry now carries the website's full headline
 * because the app was aligned to it word for word ("Training programs that
 * build careers.").
 */
const HOME_BAND: { name: string; re: RegExp }[] = [
  { name: "curriculum", re: /^100\+ project curriculum/ },
  { name: "training", re: /^Training programs that build careers\.?/ },
  { name: "pilot costing", re: /^Illustrative pilot costing/ },
];

/**
 * On the website the training headline sits in the same <section> as the
 * curriculum eyebrow, so "100+ project curriculum" and the headline are both
 * present; the app splits them into two bands. Either way the three headings
 * must appear in this order on both surfaces.
 */

function vis(page: Page, text: string): Locator {
  return page
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first();
}

async function openMenu(page: Page) {
  await page.goto("/");
  const menu = vis(page, "Menu");
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
}

async function openAppScreen(page: Page, label: string) {
  await openMenu(page);
  const link = vis(page, label);
  await expect(link).toBeVisible();
  await link.click();
}

/**
 * Read the number printed beside each label. Tag-agnostic: finds the leaf
 * holding the label, walks to its container, strips the label and takes the
 * first digits. Works for the app's <Text> pair and the website's
 * <strong>+<p> pair without knowing either.
 */
async function readCounts(page: Page, labels: string[]) {
  return page.evaluate((wanted) => {
    const out: Record<string, string> = {};
    const leaves = Array.from(
      document.querySelectorAll<HTMLElement>("*"),
    ).filter((el) => el.childElementCount === 0 && el.textContent?.trim());
    for (const label of wanted) {
      const leaf = leaves.find((el) => el.textContent!.trim() === label);
      if (!leaf) continue;
      const containerText = (leaf.parentElement?.textContent ?? "").replace(
        label,
        "",
      );
      const digits = containerText.match(/\d+/);
      if (digits) out[label] = digits[0];
    }
    return out;
  }, labels);
}

/** Vertical order of the given headings, top to bottom. */
async function headingOrder(
  page: Page,
  headings: { name: string; re: RegExp }[],
) {
  const positions: { name: string; y: number }[] = [];
  for (const { name, re } of headings) {
    const box = await page
      .getByText(re)
      .filter({ visible: true })
      .first()
      .boundingBox();
    if (box) positions.push({ name, y: box.y });
  }
  return positions.sort((a, b) => a.y - b.y).map((p) => p.name);
}

test.describe("App vs website", () => {
  test.skip(
    !WEBSITE_URL,
    "set WEBSITE_URL (e.g. http://127.0.0.1:3000) to compare against the website",
  );

  test("About shows the same four live stats, with the same numbers", async ({
    page,
    context,
  }) => {
    await openAppScreen(page, "About");
    await expect(
      vis(page, "Engineering with a reason to exist."),
    ).toBeVisible();

    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/about`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website.getByText("Engineering with a reason to exist.").first(),
    ).toBeVisible({ timeout: 60_000 });

    const [appCounts, webCounts] = await Promise.all([
      readCounts(page, LIVE_LABELS),
      readCounts(website, LIVE_LABELS),
    ]);

    // Credential-less CI cannot reach the DB, and the two surfaces degrade in
    // deliberately different ways: the website renders its bundled products,
    // while the app's catalog is DB-only by design, so it hides the stats
    // block rather than printing a screen of zeroes. In that case the website
    // side is still held to all four rows (it must not quietly drop one), and
    // the app side is documented instead of compared.
    if (Object.keys(appCounts).length === 0) {
      test
        .info()
        .annotations.push(
          {
            type: "data source",
            description:
              "app has no catalog offline — About stats block not rendered",
          },
          { type: "website counts", description: JSON.stringify(webCounts) },
        );
      expect(Object.keys(webCounts).sort()).toEqual([...LIVE_LABELS].sort());
      await website.close();
      return;
    }

    // Every row must exist on BOTH sides — a missing row is the failure the
    // app had before it published only two of the four.
    expect(Object.keys(appCounts).sort()).toEqual([...LIVE_LABELS].sort());
    expect(Object.keys(webCounts).sort()).toEqual([...LIVE_LABELS].sort());

    // …and when the app does have data, the numbers must agree, since both
    // read the same products table. A mismatch here usually means the two
    // surfaces were started against different data sources — point the
    // website at the same credentials the app was built with.
    expect(
      appCounts,
      `About counts differ. If the website was started without credentials it serves its bundled catalog while the app reads the live DB; run both with the same data source.`,
    ).toEqual(webCounts);

    await website.close();
  });

  test("Home shows the program band in the website's order", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(
      page
        .getByText("Technology you can touch")
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/`, { waitUntil: "domcontentloaded" });
    await expect(
      website.getByText("100+ project curriculum").first(),
    ).toBeVisible({ timeout: 60_000 });

    const [appOrder, webOrder] = await Promise.all([
      headingOrder(page, HOME_BAND),
      headingOrder(website, HOME_BAND),
    ]);

    // Same three sections, same relative order on both surfaces.
    const expected = HOME_BAND.map((h) => h.name);
    expect(appOrder).toEqual(expected);
    expect(webOrder).toEqual(expected);

    await website.close();
  });
});
