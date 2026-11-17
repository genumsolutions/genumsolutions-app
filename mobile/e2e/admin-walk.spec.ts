// =====================================================================
// admin-walk.spec.ts — 390×844 walk of every admin tab and section.
//
// The layout smoke test proves the editors open and the page scrolls. This
// walks the whole console the way an admin would, on a mocked staff session
// with deliberately long rows, and fails if anything is drawn outside the
// phone width. Screenshots land in test-results/screenshots/walk/ so the
// visual pass has something to look at.
//
// No real credentials: the session and every Supabase call are stubbed here,
// exactly like admin-layout.spec.ts (this repo has no test project).
// =====================================================================
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STAFF_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_EMAIL = "staff-preview@example.test";
const SHOTS = "test-results/screenshots/walk";

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      role: "authenticated",
      sub: STAFF_ID,
    }),
    "local-preview-signature",
  ].join(".");
  const user = {
    id: STAFF_ID,
    aud: "authenticated",
    role: "authenticated",
    email: STAFF_EMAIL,
    app_metadata: {
      provider: "email",
      providers: ["email"],
      role: "staff",
    },
    user_metadata: { name: "Local staff preview" },
    created_at: new Date().toISOString(),
  };
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "local-preview-refresh",
    user,
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "content-range, x-total-count",
  };
}

// Long, realistic strings on purpose: an admin list has to survive a customer
// name, a product title and an email that all want more width than 390px.
const ROWS: Record<string, Record<string, unknown>[]> = {
  orders: [
    {
      id: "ord-1",
      order_number: "GS-2026-1042",
      user_id: STAFF_ID,
      email: "ananya.subramanian@example-customer-domain.test",
      customer_name: "Ananya Subramanian (bulk school order)",
      name: "Ananya Subramanian",
      status: "paid",
      payment_status: "paid",
      total_npr: 18999,
      provider: "esewa",
      address: "Kochi, Kerala",
      created_at: "2026-11-14T09:20:00.000Z",
      items: [
        { name: "4WD Smart Car — classroom kit", quantity: 2, price: 6999 },
        { name: "Ultrasonic sensor module", quantity: 3, price: 499 },
      ],
    },
    {
      id: "ord-2",
      order_number: "GS-2026-1043",
      user_id: STAFF_ID,
      email: "rahul@example.test",
      customer_name: "Rahul Menon",
      name: "Rahul Menon",
      status: "pending",
      payment_status: "pending",
      total_npr: 2499,
      provider: "esewa",
      address: "Kochi, Kerala",
      created_at: "2026-11-15T18:02:00.000Z",
      items: [{ name: "Line follower add-on", quantity: 1, price: 2499 }],
    },
  ],
  products: [
    {
      id: "prd-1",
      name: "Genum 4WD Smart Car with Bluetooth and autonomous obstacle avoidance",
      slug: "genum-4wd-smart-car-bluetooth-autonomous",
      price: 6999,
      stock: 12,
      category: "Smart cars",
      description:
        "A classroom-ready four-wheel-drive chassis with Bluetooth control, line following and an ultrasonic obstacle-avoidance loop.",
      image_url: "https://example.test/images/4wd-smart-car.png",
      active: true,
      created_at: "2026-09-01T00:00:00.000Z",
    },
  ],
  journal_posts: [
    {
      id: "jrn-1",
      title: "How a school in Kochi ran a robotics week with twelve Genum kits",
      slug: "kochi-robotics-week",
      excerpt:
        "Twelve kits, four classes and one very loud demo day — a walkthrough of the schedule that worked.",
      body: "Long body text the admin list should truncate rather than push the card wider than the phone.",
      published: true,
      created_at: "2026-11-02T00:00:00.000Z",
    },
  ],
  services: [
    {
      id: "svc-1",
      name: "On-site robotics workshop for schools (two days, up to 30 students)",
      description:
        "Two-day workshop covering chassis assembly, sensor wiring and a demo-day competition.",
      price: 25000,
      active: true,
    },
  ],
  customer_messages: [
    {
      id: "msg-1",
      name: "Priya Nair",
      email: "priya.nair@example-school-domain.test",
      message:
        "We would like a quote for twenty 4WD kits plus a two-day workshop at our Kochi campus in January. Could you also share the invoice format your team uses for schools?",
      status: "new",
      created_at: "2026-11-15T11:30:00.000Z",
    },
  ],
  newsletter_subscribers: [
    {
      id: "sub-1",
      email: "deepa.krishnan.parent-account@example-customer-domain.test",
      source: "app-account",
      status: "subscribed",
      created_at: "2026-11-14T07:15:00.000Z",
    },
  ],
  profiles: [
    {
      id: STAFF_ID,
      name: "Ananya Subramanian",
      email: "ananya.subramanian@example-customer-domain.test",
      role: "staff",
      tier: "pro",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  user_activity_log: [
    {
      id: "act-1",
      user_id: STAFF_ID,
      action: "opened the smart car control hub and connected over Bluetooth",
      created_at: "2026-11-15T07:15:00.000Z",
    },
  ],
  activity_log: [
    {
      id: "act-2",
      user_id: STAFF_ID,
      action: "signed in from a new device",
      created_at: "2026-11-15T07:15:00.000Z",
    },
  ],
  app_logs: [
    {
      id: "log-1",
      level: "error",
      scope: "control-hub",
      message:
        "BLE write failed after three retries while sending the motor command frame",
      created_at: "2026-11-15T07:15:00.000Z",
    },
  ],
  device_crash_reports: [
    {
      id: "crash-1",
      user_id: STAFF_ID,
      device_name: "Genum 4WD Smart Car",
      error: "TypeError: cannot read properties of undefined (reading 'servo')",
      created_at: "2026-11-15T07:15:00.000Z",
    },
  ],
  print_categories: [
    {
      id: "cat-1",
      slug: "drone-frames",
      name: "Drone frames and mounts",
      description:
        "Printable frames, arms and camera mounts for classroom drones.",
      image_url: "https://example.test/images/drone-frame.png",
      sort_order: 1,
      active: true,
    },
  ],
  print_materials: [
    {
      id: "mat-1",
      name: "PLA+",
      description: "Tough everyday filament for classroom parts.",
      price_per_gram: 2.5,
      active: true,
    },
  ],
  print_promotions: [
    {
      id: "promo-1",
      title: "School bundle — 15% off orders above 500g of filament",
      description:
        "Applies automatically at checkout for verified school accounts.",
      discount_type: "percent",
      discount_value: 15,
      active: true,
    },
  ],
  print_services: [
    {
      id: "psvc-1",
      title: "Design review and print-ready slicing for a custom bracket",
      description:
        "We check wall thickness, tolerances and orientation before printing.",
      price: 1500,
      active: true,
    },
  ],
  print_quote_requests: [
    {
      id: "quote-1",
      name: "Priya Nair",
      email: "priya.nair@example-school-domain.test",
      details:
        "Six drone frames plus camera mounts, PLA+ in matte black, needed before the 20th.",
      status: "new",
      created_at: "2026-11-15T11:30:00.000Z",
    },
  ],
  project_pricing: [
    {
      id: "proj-1",
      name: "Smart dustbin project bundle",
      description:
        "Servo lid, ultrasonic sensor and controller board bundled for a classroom build.",
      price: 3499,
      active: true,
    },
  ],
  training_programs: [
    {
      id: "tp-1",
      name: "Robotics foundation — eight week after-school program",
      description: "Chassis, sensors, line following and a demo-day challenge.",
      price: 7999,
      active: true,
    },
  ],
  company_info: [
    {
      id: 1,
      name: "Genum Solutions Private Limited",
      email: "hello@genumsolutions.test",
      phone: "+91 90000 00000",
      address:
        "Second floor, Technology Innovation Centre, Kochi, Kerala 682016",
      description:
        "Robotics kits, workshops and 3D printing for schools and makers.",
    },
  ],
};

async function mockBackend(page: Page) {
  const session = fakeSession();

  await page.route("**/api/auth/suspicion", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({ requiresVerification: false }),
    }),
  );

  await page.route("**/auth/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders(),
        body: JSON.stringify(session),
      });
      return;
    }
    if (url.pathname.endsWith("/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders(),
        body: JSON.stringify(session.user),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({}),
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }
    const url = new URL(route.request().url());
    const table = url.pathname.split("/rest/v1/")[1]?.split("/")[0] ?? "";
    const rows = ROWS[table] ?? [];
    // PostgREST returns a bare object when the request asks for one.
    const wantsObject = (route.request().headers()["accept"] ?? "").includes(
      "vnd.pgrst.object",
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        ...corsHeaders(),
        "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      },
      body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
    });
  });
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/**
 * Anything painted past the phone width that is not inside a strip that is
 * meant to scroll sideways. The tab rows are the only intentional case.
 */
async function overflowOffenders(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    const insideHorizontalScroller = (el: Element) => {
      let node = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (
          /auto|scroll/.test(style.overflowX) &&
          node.scrollWidth > node.clientWidth + 1
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };
    document.querySelectorAll("body *").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.right <= vw + 1 && rect.left >= -1) return;
      if (insideHorizontalScroller(el)) return;
      const text = (el.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 48);
      out.push(
        `${el.tagName.toLowerCase()} left=${Math.round(rect.left)} right=${Math.round(rect.right)} ${JSON.stringify(text)}`,
      );
    });
    return out.slice(0, 6);
  });
}

const WALK: {
  tab: string;
  sections?: string;
  steps: string[];
}[] = [
  {
    tab: "Dashboard",
    sections: "Dashboard sections",
    steps: ["Overview", "Activity"],
  },
  { tab: "Orders", sections: "Order sections", steps: ["Orders", "Finance"] },
  { tab: "Electronic Products", steps: [] },
  {
    tab: "3D Products",
    sections: "3D Products sections",
    steps: [
      "Catalog",
      "All categories",
      "Pricing",
      "Costs",
      "Promotions",
      "Print services",
      "Requests",
      "Reports",
    ],
  },
  { tab: "Projects", steps: [] },
  {
    tab: "Content",
    sections: "Content sections",
    // Labels, not stored values: Services -> "Storefront services" (the print
    // studio has its own), Content -> "Site copy" (it sat inside "Content").
    steps: ["Storefront services", "Journal", "Site copy"],
  },
  {
    tab: "Users",
    sections: "User administration sections",
    steps: ["Users", "Messages", "Logs"],
  },
  {
    tab: "Settings",
    steps: ["Company details", "Contact", "Social & messaging"],
  },
];

test("every admin tab and section fits the phone width", async ({ page }) => {
  test.setTimeout(180_000);
  await mockBackend(page);
  await page.goto("/");

  await page.getByLabel("Sign in", { exact: true }).click();
  const unconfigured = page.getByText(
    "Sign-in is not configured in this build yet.",
    { exact: true },
  );
  if (await unconfigured.isVisible().catch(() => false)) {
    test.skip(
      true,
      "Export with a configured (test-only is fine) Supabase URL and anon key.",
    );
  }

  await page.getByLabel("Email", { exact: true }).last().fill(STAFF_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .last()
    .fill("local-preview-only");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Open account", { exact: true })).toBeVisible();

  await page
    .getByText("Menu", { exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByText("Admin dashboard", { exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("tablist", { name: "Dashboard sections" }),
  ).toBeVisible();

  // One report for the whole walk: fixing layout one assertion at a time would
  // hide the next offender behind the first.
  const overflows: string[] = [];
  const check = async (where: string) => {
    for (const offender of await overflowOffenders(page)) {
      overflows.push(`${where}: ${offender}`);
    }
  };

  let index = 0;
  for (const step of WALK) {
    index += 1;
    const slug = step.tab.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // The top strip renders before any section strip, so `.first()` is the tab
    // itself even when a section happens to share its name (Orders).
    const topTab = page
      .getByRole("tab", { name: step.tab, exact: true })
      .first();
    await topTab.click();
    // RN-web drops accessibilityState, so the selected tab is the one that
    // carries the navy underline.
    await expect(topTab).toHaveClass(/border-navy/);
    await page.waitForTimeout(400);

    if (step.sections) {
      const strip = page.getByRole("tablist", { name: step.sections });
      await expect(strip).toBeVisible();
      for (const [stepIndex, section] of step.steps.entries()) {
        await strip.getByRole("tab", { name: section, exact: true }).click();
        await page.waitForTimeout(400);
        await check(`${step.tab} → ${section}`);
        await shot(
          page,
          `${String(index).padStart(2, "0")}-${slug}-${stepIndex + 1}-${section
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,
        );
      }
      continue;
    }

    for (const [stepIndex, section] of step.steps.entries()) {
      await page
        .getByText(section, { exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForTimeout(400);
      await check(`${step.tab} → ${section}`);
      await shot(
        page,
        `${String(index).padStart(2, "0")}-${slug}-${stepIndex + 1}-${section
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
      );
    }
    await check(step.tab);
    await shot(page, `${String(index).padStart(2, "0")}-${slug}`);
  }

  expect(overflows, "admin screens paint outside the 390px viewport").toEqual(
    [],
  );
});
