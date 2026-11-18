// =====================================================================
// e2e/website-parity.spec.ts — the app and the website, rendered side by
// side, asserted against each other.
//
// The other specs check the app against its own expectations. This one
// checks it against the thing it is supposed to mirror: the same four live
// stats on /about (with the same NUMBERS, both read the same DB), the same
// program-band headings in the same order on Home, the same Services content,
// the same project packages with the same project-information card on the
// Projects screens, the same electronic-product cards and detail on the Shop
// tab, and the same 3D-model cards and detail on the Printing tab.
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

/**
 * readCounts, but wait for the block to finish loading first. Both surfaces
 * paint their live stats after an async catalog read: the website server-side,
 * the app after its Supabase attempt fails and it falls back to the bundled
 * catalog. That fallback can take seconds when the placeholder host has to
 * time out, so reading immediately races the render.
 */
async function readCountsSettled(page: Page, labels: string[]) {
  let counts: Record<string, string> = {};
  await expect
    .poll(
      async () => {
        counts = await readCounts(page, labels);
        return Object.keys(counts).length;
      },
      {
        timeout: 30_000,
        message: "live stats should settle on all four rows",
      },
    )
    .toBe(labels.length);
  return counts;
}

/**
 * Card names on the app's Projects grid.
 *
 * react-native-web renders each ProductCard's Pressable (which carries
 * accessibilityLabel = `Open {product.name}`) as a <button> with an
 * aria-label, so we can read card names the same way the website test reads
 * them: from the `Open ` prefix of the aria-label. This is more reliable than
 * scanning visible text, because the card's secondary line ("Request quote" / a
 * price) lives in the same button and would otherwise pollute a text-node scan.
 *
 * The Projects screen wraps each card in a <View className="mb-3 flex-1">;
 * react-native-web renders that as a <div> carrying the "mb-3" class. The home
 * screen's product grid (kept below the Projects screen by the stack and which
 * would otherwise also surface "Open {name}" buttons) does not use that wrapper,
 * so scoping to descendants of a "mb-3" container isolates the Projects grid.
 *
 * Nav buttons that also carry an "Open " aria-label ("Open cart", "Open Tools",
 * "Open navigation menu", "Open checkout") are excluded so only real card names
 * survive.
 */
async function appProjectCardNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('div.mb-3 button[aria-label^="Open "]'),
    )
      .map((b) =>
        b
          .getAttribute("aria-label")!
          .replace(/^Open /, "")
          .trim(),
      )
      .filter((name) => {
        if (!name) return false;
        // Drop nav / chrome buttons that also carry an "Open " aria-label.
        if (
          name === "cart" ||
          name === "Tools" ||
          name === "navigation menu" ||
          name === "checkout"
        )
          return false;
        return true;
      }),
  );
}

/**
 * Product / model card names visible on the app's Shop or Printing grid.
 *
 * Both grids render ProductCard via react-native-web as a <button> with an
 * aria-label = `Open {product.name}`. Tab navigation (vs the stack navigation
 * used for Projects) properly unmounts the previous tab's content, so a
 * visibility-filtered scan of `button[aria-label^="Open "]` already isolates
 * the active tab's cards — no wrapper-class scoping is needed.
 *
 * Nav buttons that also carry an "Open " aria-label ("Open cart", "Open Tools",
 * "Open navigation menu", "Open checkout") are excluded so only real card names
 * survive.
 */
async function appProductGridNames(page: Page): Promise<string[]> {
  return page
    .locator('button[aria-label^="Open "]')
    .filter({ visible: true })
    .evaluateAll((nodes) =>
      nodes
        .map((n) =>
          n
            .getAttribute("aria-label")!
            .replace(/^Open /, "")
            .trim(),
        )
        .filter((name) => {
          if (!name) return false;
          if (
            name === "cart" ||
            name === "Tools" ||
            name === "navigation menu" ||
            name === "checkout"
          )
            return false;
          return true;
        }),
    );
}

/**
 * Open a bottom tab (Shop / Printing) on the app. The tab bar renders its
 * labels as text nodes inside a button; clicking the text toggles the tab and
 * unmounts the previous tab's content.
 */
async function openAppTab(page: Page, label: string) {
  await page.goto("/");
  await expect(
    page
      .getByText("Technology you can touch")
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  const tab = page.getByText(label).filter({ visible: true }).first();
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
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
    ).toBeVisible({
      timeout: 60_000,
    });

    const [appCounts, webCounts] = await Promise.all([
      readCountsSettled(page, LIVE_LABELS),
      readCountsSettled(website, LIVE_LABELS),
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
    ).toBeVisible({
      timeout: 60_000,
    });

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

  test("Projects lists the website's packages and shows the same project information", async ({
    page,
    context,
    request,
  }) => {
    type CatalogProduct = {
      id: string;
      name: string;
      productType?: string | null;
    };

    // ---- the website: its listing, then one of its project pages ----
    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/projects`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website.getByRole("heading", {
        name: /teaching, automation, and robot-car projects\./i,
        level: 1,
      }),
    ).toBeVisible({ timeout: 60_000 });

    // Project names as the site's cards announce them (ProductCard's
    // aria-label). Pre-packaged kits ride the same grid, hence the type
    // filter further down.
    const webNames = await website.evaluate(() =>
      Array.from(document.querySelectorAll('a[aria-label^="Open "]'))
        .map((a) =>
          a
            .getAttribute("aria-label")!
            .replace(/^Open /, "")
            .trim(),
        )
        .filter(Boolean),
    );
    expect(webNames.length, "website project cards").toBeGreaterThan(0);

    // ---- the app: the same grid ----
    await openAppScreen(page, "Projects");

    // The RN-web bundle paints the Projects grid several seconds after the
    // client-side navigation (the bundled Supabase client spends that time
    // exhausting its placeholder connection attempt before the in-flight
    // catalog promise resolves to BUNDLED_PRODUCTS). The other app tests
    // wait on a specific visible element; mirror that here rather than
    // asserting the empty state is absent immediately, which passes before
    // the grid has rendered.
    await expect(
      page.getByText(/No projects found/).filter({ visible: true }),
      "app Projects rendered its empty state",
    ).toHaveCount(0);

    // Wait for the grid to actually paint project cards. The RN-web bundle
    // paints the Projects grid several seconds after the client-side
    // navigation (the bundled Supabase client spends that time exhausting its
    // placeholder connection attempt before the in-flight catalog promise
    // resolves to BUNDLED_PRODUCTS). Poll the same visible-text scan used
    // below so we only proceed once the first page of cards is on screen.
    await expect
      .poll(async () => (await appProjectCardNames(page)).length, {
        timeout: 30_000,
        message: "app Projects grid should render project cards",
      })
      .toBeGreaterThan(0);

    // The app paginates its grid, so this is a subset check: every package
    // the phone shows first must be one the website lists. The app's cards
    // carry their name in the Pressable's accessibilityLabel (`Open {name}`),
    // which react-native-web renders as a <button> aria-label — read via the
    // shared `appProjectCardNames` scan.
    const appNames = await appProjectCardNames(page);
    expect(
      appNames.length,
      "app project cards on the first page",
    ).toBeGreaterThan(0);

    const webSet = new Set(webNames);
    for (const name of appNames) {
      expect(
        webSet.has(name),
        `app lists a project the website does not: ${name}`,
      ).toBe(true);
    }

    // Which of them is a project package? Kits carry no project-information
    // card. The website's catalog endpoint serves the same row both surfaces
    // render.
    const response = await request.get(`${WEBSITE_URL}/api/products`);
    expect(response.ok(), "the website catalog endpoint responds").toBeTruthy();
    const catalog = (await response.json()) as CatalogProduct[];
    const target = catalog.find(
      (product) =>
        appNames.includes(product.name) &&
        String(product.productType ?? "")
          .trim()
          .toLowerCase() === "project package",
    );
    if (!target) {
      throw new Error(
        `none of the app's first-page projects is a project package: ${appNames.join(", ")}`,
      );
    }

    // Open it on the phone. The card's own text bubbles to its Pressable.
    await vis(page, target.name).click();
    await expect(
      vis(page, "Project information"),
      "the app's project page has no project-information card",
    ).toBeVisible({ timeout: 20_000 });

    // ---- the same project on the website ----
    await website.goto(`${WEBSITE_URL}/products/${target.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website.getByText("Project information", { exact: true }).first(),
    ).toBeVisible({
      timeout: 60_000,
    });

    // Scrape the card: its prose (overview, estimated duration) and its
    // section headings (Objectives, Materials required, Software and code, …).
    const site = await website.evaluate(() => {
      const text = (el: Element | null | undefined) =>
        (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      const label = Array.from(document.querySelectorAll("*")).find(
        (el) =>
          el.childElementCount === 0 && text(el) === "Project information",
      );
      const section = label?.parentElement;
      if (!section) return { paragraphs: [], headings: [] };
      return {
        paragraphs: Array.from(section.querySelectorAll("p"))
          .map(text)
          .filter((t) => t && t !== "Project information"),
        headings: Array.from(section.querySelectorAll("h2")).map(text),
      };
    });

    // Guard the guard: if the website markup moved, fail loudly instead of
    // silently comparing nothing.
    expect(
      site.paragraphs.length + site.headings.length,
      "the website's project page rendered no project-information content",
    ).toBeGreaterThan(0);

    test.info().annotations.push({
      type: "compared",
      description: `${target.name}: ${site.paragraphs.length} paragraphs, ${site.headings.length} headings`,
    });

    // Every line of project copy the site shows — including the three detail
    // blocks when the catalog carries them — must be on the app's page too.
    for (const paragraph of site.paragraphs) {
      await expect(
        page
          .getByText(paragraph, { exact: false })
          .filter({ visible: true })
          .first(),
        `app is missing the website's project copy: ${paragraph.slice(0, 60)}…`,
      ).toBeVisible();
    }
    for (const heading of site.headings) {
      await expect(
        vis(page, heading),
        `app is missing the website's project section: ${heading}`,
      ).toBeVisible();
    }

    await website.close();
  });

  /**
   * Decode HTML entities that appear in website card aria-labels (e.g.
   * `&quot;` for `"`). The app renders the raw character, so we must normalise
   * the website side to the same form before comparing.
   */
  function decodeHtmlEntities(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  test("Shop lists the website's electronic products and shows the same product detail", async ({
    page,
    context,
    request,
  }) => {
    // ---- the website: its /products listing ----
    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/products`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website
        .getByRole("heading", {
          name: /electronic products/i,
          level: 1,
        })
        .or(website.getByText(/electronic products/i).first()),
    ).toBeVisible({ timeout: 60_000 });

    // Product names as the site's cards announce them (ProductCard's
    // aria-label). The website renders each card twice in the static HTML
    // (SSR + hydration), so dedupe by name.
    const webNames = await website.evaluate(() =>
      Array.from(document.querySelectorAll('a[aria-label^="Open "]'))
        .map((a) =>
          a
            .getAttribute("aria-label")!
            .replace(/^Open /, "")
            .trim(),
        )
        .filter(Boolean),
    );
    expect(webNames.length, "website product cards").toBeGreaterThan(0);
    const webSet = new Set(webNames.map(decodeHtmlEntities));

    // ---- the app: the Shop tab grid ----
    await openAppTab(page, "Electronic Products");

    // The RN-web bundle paints the Shop grid several seconds after the tab
    // switch (the bundled Supabase client spends that time exhausting its
    // placeholder connection attempt before the in-flight catalog promise
    // resolves to BUNDLED_PRODUCTS). Poll the visible card scan so we only
    // proceed once the first page of cards is on screen.
    await expect
      .poll(async () => (await appProductGridNames(page)).length, {
        timeout: 30_000,
        message: "app Shop grid should render product cards",
      })
      .toBeGreaterThan(0);

    const appNames = await appProductGridNames(page);
    expect(
      appNames.length,
      "app product cards on the first page",
    ).toBeGreaterThan(0);

    // The app paginates its grid, so this is a subset check: every product
    // the phone shows first must be one the website lists.
    for (const name of appNames) {
      expect(
        webSet.has(name),
        `app lists a product the website does not: ${name}`,
      ).toBe(true);
    }

    // Which of them is a shop product (not a project package)? The website's
    // catalog endpoint serves the same row both surfaces render.
    const response = await request.get(`${WEBSITE_URL}/api/products`);
    expect(response.ok(), "the website catalog endpoint responds").toBeTruthy();
    const catalog = (await response.json()) as Array<{
      id: string;
      name: string;
      productType?: string | null;
      priceLabel?: string;
      sku?: string;
    }>;
    const target = catalog.find(
      (product) =>
        appNames.includes(product.name) &&
        String(product.productType ?? "")
          .trim()
          .toLowerCase() !== "project package",
    );
    if (!target) {
      throw new Error(
        `none of the app's first-page products is a shop product: ${appNames.join(", ")}`,
      );
    }

    // Open it on the phone. The card's own text bubbles to its Pressable.
    await page
      .getByRole("button", { name: `Open ${target.name}` })
      .filter({ visible: true })
      .first()
      .click();
    // ProductDetail renders after the deep-linked navigation settles; poll
    // for the product name (the one piece every product page has).
    await expect(
      page.getByText(target.name).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // ---- the same product on the website ----
    await website.goto(`${WEBSITE_URL}/products/${target.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      website.getByText(target.name).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 60_000 }); // Compare the product detail fields both surfaces share: the app's
    // ProductDetail mirrors the website's product page. Both read the same
    // catalog row, so the shared fields must agree. We check name + price +
    // SKU (always present, exact-match) rather than scraping all text, because
    // the app's stacked screen keeps the home/shop chrome in the DOM below the
    // detail screen.
    if (target.priceLabel) {
      await expect(
        page.getByText(target.priceLabel).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        website
          .getByText(target.priceLabel, { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    }
    if (target.sku) {
      await expect(
        page.getByText(target.sku).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        website
          .getByText(target.sku, { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    test.info().annotations.push({
      type: "compared",
      description: `${appNames.length} app cards vs ${webSet.size} website products; detail ${target.name}: price ${target.priceLabel}, SKU ${target.sku || "—"}`,
    });

    await website.close();
  });

  test("Printing lists the website's 3D models and shows the same model detail", async ({
    page,
    context,
    request,
  }) => {
    // ---- the website: its /3d-printing model grid ----
    const website = await context.newPage();
    await website.goto(`${WEBSITE_URL}/3d-printing`, {
      waitUntil: "domcontentloaded",
    });
    // The website's /3d-printing page headlines its model grid with "Pick a
    // model, we print it." — the app's Printing tab headlines the same grid
    // "3D Products / Printed in-house, on request." Either way we wait for
    // the page to render its first H2 so the card scan below has something
    // to read.
    await expect(
      website.getByRole("heading", { level: 2 }).first(),
    ).toBeVisible({ timeout: 60_000 });

    const webNames = await website.evaluate(() =>
      Array.from(document.querySelectorAll('a[aria-label^="Open "]'))
        .map((a) =>
          a
            .getAttribute("aria-label")!
            .replace(/^Open /, "")
            .trim(),
        )
        .filter(Boolean),
    );
    expect(webNames.length, "website 3d model cards").toBeGreaterThan(0);
    const webSet = new Set(webNames.map(decodeHtmlEntities));

    // ---- the app: the Printing tab grid ----
    await openAppTab(page, "3D Products");

    await expect
      .poll(async () => (await appProductGridNames(page)).length, {
        timeout: 30_000,
        message: "app Printing grid should render model cards",
      })
      .toBeGreaterThan(0);

    const appNames = await appProductGridNames(page);
    expect(
      appNames.length,
      "app 3d model cards on the first page",
    ).toBeGreaterThan(0);

    for (const name of appNames) {
      expect(
        webSet.has(name),
        `app lists a 3d model the website does not: ${name}`,
      ).toBe(true);
    }

    // Open a model on the phone.
    const modelName = appNames[0];
    await page
      .getByRole("button", { name: `Open ${modelName}` })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByText(modelName).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // ---- the same model on the website ----
    const model = (await (
      await request.get(`${WEBSITE_URL}/api/products`)
    ).json()) as Array<{
      id: string;
      name: string;
    }>;
    const targetModel = model.find((m) => m.name === modelName);
    if (targetModel) {
      await website.goto(`${WEBSITE_URL}/products/${targetModel.id}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        website.getByText(modelName).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 60_000 });
    }

    test.info().annotations.push({
      type: "compared",
      description: `${appNames.length} app models vs ${webSet.size} website models; detail ${modelName}`,
    });

    await website.close();
  });
});
