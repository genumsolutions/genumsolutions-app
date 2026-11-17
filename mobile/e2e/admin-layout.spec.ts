import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STAFF_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_EMAIL = "staff-preview@example.test";
const SCREENSHOTS = "test-results/screenshots";

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

async function mockBackend(page: Page) {
  const session = fakeSession();
  const user = session.user;

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
        body: JSON.stringify(user),
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { ...corsHeaders(), "content-range": "*/0" },
      body: "[]",
    });
  });
}

test("staff admin sections stay scrollable and editors open on demand", async ({
  page,
}) => {
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

  const dashboardSections = page.getByRole("tablist", {
    name: "Dashboard sections",
  });
  await expect(dashboardSections).toBeVisible();
  mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({
    path: `${SCREENSHOTS}/admin-dashboard.png`,
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Activity", { exact: true }).last(),
  ).toBeVisible();

  await page.getByRole("tab", { name: "3D Products", exact: true }).click();
  await page.getByRole("tab", { name: "Categories", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("New category", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(
    page.getByText("New category", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const saveCategory = page.getByRole("button", {
    name: "Save category",
    exact: true,
  });
  await saveCategory.scrollIntoViewIfNeeded();
  await expect(saveCategory).toBeInViewport();
  await page.screenshot({
    path: `${SCREENSHOTS}/admin-category-editor.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Gallery was retired from the 3D Products studio; PRINT_ADMIN_SECTIONS is
  // the source of truth for what this loop may drive.
  for (const [section, title] of [
    ["Promotions", "New promotion"],
    ["Services", "New service"],
  ] as const) {
    await page.getByRole("tab", { name: section, exact: true }).click();
    await expect(
      page.getByText(title, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(
      page.getByText(title, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
