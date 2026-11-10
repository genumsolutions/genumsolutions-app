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

    test.info().annotations.push({
      type: "data source",
      description: `app ${JSON.stringify(appCounts)} vs website ${JSON.stringify(webCounts)}`,
    });

    // Every row must exist on BOTH sides — a missing row is the failure the
    // app had before it published only two of the four.
    expect(Object.keys(appCounts).sort()).toEqual([...LIVE_LABELS].sort());
    expect(Object.keys(webCounts).sort()).toEqual([...LIVE_LABELS].sort());

    // …and the numbers must agree. With credentials both read the same
    // products table; without them both serve the same bundled catalog
    // (the app bundles the website's, so 55/0/0/7 either way). A mismatch
    // means the two surfaces were started against different data sources.
    expect(
      appCounts,
      `About counts differ — run both surfaces against the same data source (live DB or bundled catalog).`,
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

  test("Services lists the website's training programs, pilot costs and curriculum bands", async ({
    page,
    context,
  }) => {
    await openAppScreen(page, "Services");
    await expect(vis(page, "What GENUM does")).toBeVisible();

    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/services`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website
        .getByText("Useful support from first idea to finished result.")
        .first(),
    ).toBeVisible({ timeout: 60_000 });

    // Scrape the source of truth. All three sections are DB-first with
    // bundled fallbacks on BOTH surfaces, so this works with or without
    // credentials — which is what lets the CI parity job run it.
    const site = await website.evaluate(() => {
      const text = (el: Element | string | null | undefined) =>
        (typeof el === "string" ? el : (el?.textContent ?? ""))
          .trim()
          .replace(/\s+/g, " ");

      const programs = Array.from(
        document.querySelectorAll("#training h3"),
      ).map(text);

      // Pilot table: <th scope=row>item (+note span)</th><td>cost</td>.
      const pilot = Array.from(
        document.querySelectorAll("#pilots tbody tr"),
      ).map((row) => ({
        item: text(row.querySelector("th")?.childNodes[0]?.textContent),
        cost: text(row.querySelector("td")),
        note: text(row.querySelector("th span")),
      }));

      // Curriculum bands: each highlight card opens with its age-band label.
      // Matched on the label's own styling (uppercase tracking) plus a digit,
      // because the site uppercases it with CSS and the section also holds
      // ordinary paragraphs.
      const bands = Array.from(
        document.querySelectorAll<HTMLElement>("#pilots p"),
      )
        .filter((el) => el.className.includes("uppercase"))
        .map(text)
        .filter((t) => t && /\d/.test(t));

      return { programs, pilot, bands };
    });

    // Guard the guard: if the website markup moved, fail loudly instead of
    // silently comparing nothing.
    expect(site.programs.length, "website training programs").toBeGreaterThan(
      0,
    );
    expect(site.pilot.length, "website pilot cost rows").toBeGreaterThan(0);
    expect(site.bands.length, "website curriculum bands").toBeGreaterThan(0);

    test.info().annotations.push({
      type: "compared",
      description: `${site.programs.length} programs, ${site.pilot.length} pilot rows, ${site.bands.length} curriculum bands`,
    });

    // 1. Every program title on the site is a card on the app.
    for (const title of site.programs) {
      await expect(
        vis(page, title),
        `program missing on app: ${title}`,
      ).toBeVisible();
    }

    // 2. Every pilot line item, its cost and its note — the app shows the
    //    note inline on the same row, the site puts it under the item.
    for (const row of site.pilot) {
      // Substring, not exact: the app puts "— note" inline after the item in
      // the same <Text>, while the site puts the note under it.
      await expect(
        page
          .getByText(row.item, { exact: false })
          .filter({ visible: true })
          .first(),
        `pilot item missing on app: ${row.item}`,
      ).toBeVisible();
      await expect(
        page
          .getByText(row.cost, { exact: true })
          .filter({ visible: true })
          .first(),
        `pilot cost missing on app: ${row.cost}`,
      ).toBeVisible();
      if (row.note) {
        await expect(
          page
            .getByText(row.note, { exact: false })
            .filter({ visible: true })
            .first(),
          `pilot note missing on app: ${row.note}`,
        ).toBeVisible();
      }
    }

    // 3. Every curriculum band label ("Grades 6-8", …) survives.
    for (const band of site.bands) {
      await expect(
        page.getByText(band, { exact: true }).filter({ visible: true }).first(),
        `curriculum band missing on app: ${band}`,
      ).toBeVisible();
    }

    await website.close();
  });
});
