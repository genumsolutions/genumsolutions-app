# NEXT SESSION — genumsolutions-app (2026-09-22: tiers + robot preferences round, released 3.2.5/58)

**DONE 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX,
executed (rides the next JS-only OTA — no version bump).** Full plan + decisions in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md`; web-side ledger: web TRACKS/INDEX
`U-23`. App work executed + gated: **MenuScreen redesign** (unified `MenuItem` row for
nav + toggle variants, `MenuGroup` cards, 48pt rows, icon chips, hints, Pro chip, Dark
theme / biometric admin lock / haptics switches), **ProductDetail sticky CTA bar**
(pinned bottom bar with safe-area padding; qty stepper now 44pt buttons +
`accessibilityRole`; keeps Control-this-car + Request-quote), Shop/Projects/Home/admin
consume the shared `ProductCard` (gallery-aware covers, spec chips), ProductEditor +
ProjectsScreen gallery-aware media, restored 5 firmware projects editable in admin
(`4wd4m-basic` / `2wd1m-basic` / `self-balancing-basic` / `esp32-remote` /
`smart-dustbin`, `productType:'Project package'`, category `Robot Cars`, quote-only),
adminTabs reordered to the grouped contract (12 tabs — parity pinned), owner
full-access verified. Edge `link-import` re-deployed + schema (`gallery`/`import_meta`)
applied live by the website side. Gates: app tsc 0 · vitest **185/185** · prettier
clean; web tsc · lint · vitest **123/123** · `npm run build` ✓ · prettier clean; live
harnesses 40/40 + 9/9 + 10/10 + 15/15 + 11/11 + staff-access-e2e **28/28** (new
disposable-owner path). **NOT committed — awaiting owner go.**

**PLANNED 2026-09-24 — U-23 GALLERY · PROJECTS RESTORE · ADMIN STANDARDIZATION · UX
(planned scope — executed above).** Owner-agreed plan in
`guide/PLAN-2026-09-24-GALLERY-PROJECTS-ADMIN.md` (Q&A answered 2026-09-24); decisions:
① restore ONLY the 5 GENUM firmware projects from the workspace root — skip Robo Cars/
tutorials; ② admin tabs grouped (Dashboard/Orders/Products/Projects/Services | Journal/
Content | Users/Messages | Finance | Activity | Settings) + parity; ③ full gallery cap ~8 +
backfill existing products from saved source links; ④ image-led taller cards + spec chips;
⑤ light/non-invasive staff extras; ⑥ source credit line. App work: `MenuScreen.tsx` redesign
(single MenuItem row for nav+toggles, professional grouping, kill double-padded row),
ProductDetail gallery + sticky CTA + get quantity buttons, Shop card/touch pass,
app import-by-link MUST send the previewed image + gallery on save (fix "extraction not
working / no photo after save"), Projects restore surfacing (`ProjectsScreen.tsx:82-90`,
`projectService.ts:29-32`), adminTabs reorder (`src/config/adminTabs.ts`) + parity test,
owner full-access verification. Rides the next JS-only OTA — no version bump. Execution
starts in a later session on owner go.

**LATEST (2026-09-24, rides the next OTA — JS-only):** **C5 CLOSED + C7 + UNIFICATION
ROUND PLANNED (owner: "mirror everything except Remote, through Supabase").** Read
`guide/SESSION-2026-09-24-UNIFICATION.md` FIRST — it is the authoritative log for this
round. Done 2026-09-24: ① **C7 — biometrics + haptics:** `expo-local-authentication` +
`expo-haptics` (SDK-54), `services/biometricsService.ts` (local opt-in
`genum-biometrics-admin`, default OFF, enable-requires-passing-prompt, PIN fallback kept),
`services/hapticsService.ts` (tap/impact/success/warning/selection; toggle
`genum-haptics` default ON; never throws; Vibration fallback) replacing ~20 raw
`Vibration.vibrate` call sites (Remote ×7, Tools ×4, Drive/Drone/ModeChooser,
AccountSheet, FloatingRemoteButton); Menu → Security (staff-only biometric admin-lock
switch) + Menu → Feedback (haptics); AdminScreen biometric lock overlay re-arms on every
foreground via AppState. +20 tests. ② **C5 app surface:** `config/socials.ts` (pure
helper mirroring web lib/socials 1:1) + `components/SocialsRow.tsx` (Feather chip row,
empty=hidden) in ContactScreen; scaffolding (schema cols, helpers, editors both clients)
verified complete — WhatsApp/socials are admin-editable in the SHARED company_info row.
③ **A1 PENDING (bug):** Control Panel category tagline/description render EMPTY —
`projectCategoryService.mapRow()` hardcodes "" (DB has no such columns, live-probed) and
ToolsScreen renders them directly; fix = bundled-catalog fallback by slug + thread DB
capability_labels. Gates: app tsc 0 · vitest **178/178** · prettier clean.

**UPDATE 2026-09-24 (later same session) — round COMPLETED + C7 SAFETY REVISION.**
⚠️ **Do-not-regress lesson (native deps + OTA):** release.yml's paths filter watches
`mobile/package.json`/`package-lock.json`, so adding expo-haptics +
expo-local-authentication (C7) correctly triggered an APK rebuild — same 3.2.5/58
labels, new bytes. The CI OTA bundle (runtime 3.2.5) can therefore run on devices with
the PREVIOUS 3.2.5 APK that lacks those native modules. Fix shipped: `safeNative.ts`
(cached lazy require + test injection); haptics degrades to the raw Vibration API and
biometrics reports "unsupported" (Menu row hidden, gate fails closed) when the native
side is absent — static imports of the native modules are gone. **Rule: any new native
dep must degrade gracefully in JS until its first APK ships.** App vitest now
**180/180** (native-absent degrade paths pinned). CI after the pushes: app CI ✓ · OTA
Only ✓ (bundle published for 3.2.5) · Release APK ✓; web CI ✓ · Sync app fallback ✓.
W1 live probe `scripts/web-save-image-parity.mjs` **6/6 vs prod** (staff save with a
foreign image URL → storage URL stored → next/image serves it → public catalog carries
it), committed `1935bad` → rebased over bot `7dd7c04` → pushed `dd7a5e6`.

**UPDATE 2026-09-24 (earlier) — round COMPLETED.** Full detail in
`guide/SESSION-2026-09-24-UNIFICATION.md`; parity matrix
`guide/UNIFICATION-AUDIT-2026-09-24.md`. **A1 fixed:** mapRow falls back to the bundled
catalog's tagline/description by slug (DB columns don't exist), and DB
`capability_labels` now thread through `ProjectCategory.capabilityLabels` with
ToolsScreen rendering admin labels → static map → raw key. **A3 done:**
`services/newsletterService.ts` + Account Newsletter card (required-consent checkbox,
same wording as web) → new edge `newsletter-subscribe` (deployed + live-verified:
validation, 20/min rate limit, idempotent upsert with source refresh, staff/admin
gated GET/DELETE; uses the service role after root-causing that the anon upsert
violates the staff-only RLS UPDATE policy on conflict). **A6 done:** PrintingScreen now
renders the live "Models we print" strip (category `3D Models` from the shared products
table — same rows as the website) routing to ProductDetail. **A7 done:**
OrderSuccessScreen gained the WhatsApp nudge ("I just placed an order.") + SocialsRow
from the shared company row, mirroring web checkout-success. Parity status: every
customer/admin surface is mirrored through Supabase except the documented intentional
divergences (web-push settings card = web-only; app update screen = app-only; Remote =
app-only per owner D-1). Gates: app tsc 0 · vitest **178/178** · prettier clean; web
tsc 0 · lint 0 · vitest **118/118** · build green; harnesses 9/9 + 27/27 (link-import
extended) + 10/10 + staff-e2e ALL + stock 15/15 + newsletter 11/11. **Nothing committed
yet — owner go needed.**

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C3 — RELATED PRODUCTS +
RECENTLY VIEWED (website U-20).** Both clients now share the same discovery helpers,
mirrored 1:1 (`productService.ts` ← web `lib/catalog.ts`):
`relatedProducts(all, current, limit=4)` — same category first ordered by price
proximity, then same-type active items — and `pushRecentlyViewed` /
`resolveRecentlyViewed` (most-recent-first, deduped, capped at 8, active-only, current
product excluded). App surfaces: **ProductDetail** records views to AsyncStorage and
renders "Related products" + "Recently viewed" horizontal strips (4-up cards matching
the Home grid idiom); **Shop** gains a "Recently viewed" strip above the grid, re-read
on every focus via `useFocusEffect` (navigation.push keeps Shop mounted, so a
mount-only effect would go stale). Storage is best-effort — disabled storage just hides
the rows. 5 new tests in `catalogFilters.test.ts` (ordering, cap, dedupe,
inactive-skip, no-mutation), identical to the web suite. Gates: app tsc 0 · vitest
**155/155**; web tsc 0 · lint 0 · vitest **106/106** · build green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C8 — APP POLISH: SKELETONS,
PULL-TO-REFRESH, LOGGER WIRING.** ① Shop loading state is now a skeleton grid
(`components/SkeletonCard.tsx` — 2-column card-shaped placeholders with an opacity
pulse, `ShopSkeletonGrid`) instead of a bare spinner, so the grid doesn't jump when
data arrives. ② Account tab gained pull-to-refresh AND stopped clipping: the root is
now a `ScrollView` (+`RefreshControl`) instead of a plain `View`; both orders and
messages reload via one shared `reload()` used by the initial effect and the pull.
③ Silent catch blocks now log through `services/logger.ts` (error = all builds, warn =
dev only): AccountScreen (order/message loads + profile save — was a `// no-op` that
made Save look dead), ContactScreen (company-info fallback + send failure),
AppContext (session restore, server cart push, cart merge on sign-in), and
productService's live→cache fallbacks. Intentional-quiet catches (BLE/control hot
paths, AsyncStorage cache writes, `setColorScheme` platform guard) were left alone.
Gates: app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C2 — SHOP SORT + PRICE/STOCK
FILTERS (website U-18, app parity `f058200`).** The Shop tab now has: sort (Featured /
Price low-high / Price high-low / Name A–Z), a max-price ceiling picker (500–10,000 NPR
buckets; quote-only rows never match a ceiling), and an in-stock-only toggle — mirroring
the website's `/products` 1:1 (shared helper names/behavior in `productService.ts`:
`sortProducts`/`withinPrice`/`inStockOnly`, tests in `catalogFilters.test.ts`). UI reuses
`CategoryDropdown` for both pickers + a checkbox-style toggle; empty state gains a
"Clear filters" button. Web side: URL-shareable state (`?sort=&maxPrice=&inStock=`) and
the same params accepted by `GET /api/products`. Gates: web tsc 0 · lint 0 · vitest
**101/101** · build green; app tsc 0 · vitest **150/150**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **C1 — STOCK DECREMENT ON PAID
ORDERS (website U-17).** Stock now leaves the shelf exactly once per order, at the
pending→paid moment, and comes back on cancel — enforced in the DATABASE, not the
clients. Three SECURITY DEFINER RPCs in the shared `supabase/schema.sql`:
`adjust_order_stock(items, direction)` (decrement clamps at 0 / restore),
`mark_order_paid(order_id, provider_ref)` (row-locked + idempotent: decrements items and
flips status→paid in ONE transaction; a webhook/redirect race can never double-decrement),
`restore_order_stock(order_id, expect_status)` (restore + atomic flip→cancelled, guarded
so a retry can never double-restore). Server side: website confirm routes + admin PATCH
(`lib/orders.ts` transition-aware: pending→paid decrement, paid/fulfilled→cancelled
restore, cancelled→paid re-decrement, paid→fulfilled no-op) and edge fns
`payment-esewa`/`payment-khalti`/`payment-webhook` (redeployed ACTIVE). **App side:
`adminService.updateOrderStatus` mirrors the same transitions via `supabase.rpc(...)` —
the stock RPCs re-verify staff+ server-side, so a customer token is rejected.** Buyer
flows need no change (pay path is the edge fns). Schema applied live; new harness
`genumsolutions-website/scripts/verify-stock-rpc.mjs` **15/15 PASS** vs prod. **IMPORTANT
for app checkout: the shared edge payment functions had never actually worked** — they
boot-crashed in prod (missing `NEXT_PUBLIC_*` env fallbacks) and the ESEWA/KHALTI secrets
were never set. Now fixed + live-verified (web `a2c97e2`). NOTE for future deploys: the
three payment fns MUST be deployed with `--no-verify-jwt` (the app initiates payments with
bare fetches; a plain deploy 401s every app checkout). Gates:
web tsc 0 · lint 0 · vitest **92/92**; app tsc 0 · vitest **140/140**; live harnesses
9/9 + 25/25 + 10/10 + 25/25.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **RICHER LINK-IMPORT EXTRACTION
(website U-16) — "make the extraction better so manual input may not be required."** The
shared `link-import` edge function now extracts MakerWorld **specs** (print profile,
weight, materials, filament types, compatible printer/nozzle), a **full gallery** of
images, an **enriched description** (clean summary + `Printed N times · N likes · N
collected · License:`), and pricing/category metadata in `extra`; the generic path picks
up multiple og:image/itemprop images + JSON-LD `additionalProperty` specs. App side:
`LinkPreview` gained `specs`/`priceLabel`/`extra`, **import-by-link seeds the editor with
`specs`**, and `createLinkImport` sends `specs` so the created row stores them (web
`AdminProducts.tsx` does the same). Edge fn deployed live (**verified 22/22** incl. 9-image
gallery + 5 spec lines). App tsc clean, vitest **140/140**. NOTE: the website harness
gained a cleanup guard (never deletes pre-existing/curated rows on upsert-collide) after a
harness run overwrote+deleted a live sample row — restored on the website side. Website gates:
tsc clean, lint 0, vitest **92/92**.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **link-based product import round
(arrived with website U-14).** The app admin Products tab now has **"Import by link"** next
to "+ New product": prompt → paste any product URL → the shared `link-import` edge function
extracts details (MakerWorld via anonymous Bambu design API; OpenGraph/JSON-LD fallback for
other shops) → the editor opens pre-seeded (name/description/image/category hint) → staff
fine-tunes → **Save routes through the same create flow** (image downloaded SSRF-safe →
uploaded to the `product-images` bucket → products upsert with `documentation_url` = source
link). Also this round: product writes go through `supabase.functions.invoke('admin-products')`
with real error surfacing + `Alert` toasts into `handleSaveProduct`/`handleDeleteProduct` —
the old raw-fetch + silent anon-key fallback was the root cause of the "saved product never
showed" bug (the edge fn was never deployed). New service functions in `adminService.ts`:
`previewLinkImport`, `createLinkImport`. Related deploy docs: `genumsolutions-website`
SUPABASE_ACCESS_TOKEN restored by owner for 1 week (2026-09-23) for the U-14 edge-fn deploys
(`admin-products` + `link-import` both ACTIVE and live-verified 9/9 + 15/15). App vitest
**140/140**, app tsc clean, web vitest 71/71 + tsc + lint all green.

**LATEST (2026-09-23, rides the next OTA — JS-only):** **admin-services write-path parity +
security fix.** `upsertAdminService`/`deleteAdminService` now go through
`supabase.functions.invoke('admin-services')` (JWT attached, real error surfacing + Alert
toasts in save/delete/toggle) instead of the old bare-`fetch` to the edge URL with a direct
anon-key fallback. **The old target was an UNGATED service-role function** — anyone who knew
the URL could create/update/delete services (fixed at the source: the edge fn now re-verifies
the caller role staff+/admin+ exactly like `admin-products`). `EDGE_BASE` removed from
adminService (it was only used by that one call). Service ops UX now mirrors products:
save/delete/show-hide failures surface an alert, never silently drop. App tsc clean, vitest
**140/140**. Related: website has `scripts/verify-admin-services.mjs` (**10/10** live).

**Current state:** **3.2.5 / versionCode 58** (`5fd10b1`) — **RELEASED 2026-09-22 via CI**
(bump push → `release.yml` run `35688360720` built + uploaded the APK; `release.json` =
3.2.5/58 live, website fallback synced by bot `7bb6cb5`). This native build carries the
**2026-09-22 tiers + robot-preferences round**: **`isPro` in AppContext** (session tier),
**pro-gated Remote window** (free/guest users get a locked explainer before any drive
control mounts; the Control Panel stays open to everyone), **Robot Preferences screen**
(Menu → Pro-only: per-robot code values, tuning parameters, telemetry channels via
`robotSettingsService` → the dedicated `robot_user_settings` table — completely separate
from carts/orders, mirrored on the website, admin-manageable per user from the web Users
tab), plus the **2026-09-22 residue cleanup** (`AutonomousControls`, `WeblinkControls`,
`ModeInfo`, `deviceMemoryService`, `carModeStorage` deleted — all zero-inbound; dead prop
types removed from `tools/types.ts`). Also inside: the entire P6 round (role-revoke via
`admin-set-role`, settingsService cloud-theme adoption, company-stamp icon — icons ship
only with a native APK) and the FIN-50/R-20 line. 3.2.4/57 shipped 2026-09-21 and is
superseded; 3.2.3/56 after one day. Vitest **137/137** (M3 test-repair round
2026-09-23 closed the 3 failing cartService/roboCarCatalog tests + added the tsc-fix
for the same files — see TRACKS/INDEX.md), CI green.

**Theme parity pushed 2026-09-22 (`78e10f9`, rides the next OTA — JS-only):** the owner's
2-mode decision (website theme → Light/Dim, System removed). The app's **shared**
preference now stores canonical `'light'|'dim'` only; AppContext restore maps a legacy
`'system'`/`'dim'` cloud value → dark, else light, and writes the migrated value back.
**Latent bug fixed:** `saveThemePreference` was writing the canonical `'dim'` into the
`genum-theme-mode` AsyncStorage cache key the restore effect never recognized → dark never
survived restarts; the cache now holds the app mode (light/dark), canonical only the DB
(site + app agree on one `profiles.theme_preference`). The app's OWN native Settings theme
switch keeps its OS option (native OS-follow is by design; the web System state was the
one removed). OTA run for `78e10f9` needs a green confirmation.

**Server side of the tier/robot flow is DONE + VERIFIED:** schema (`profiles.tier` +
`robot_user_settings`, RLS + `protect_tier_column`) applied to the live DB 2026-09-22;
website gates (registered-only /app download) + admin tier toggle + per-user robot-settings
manager shipped; **`genumsolutions-website/scripts/tier-robot-e2e.mjs` = 23/23 PASS vs
production** (tier lifecycle, admin cross-user access, pro gate, 401/403/405 negatives).
Re-verified 23/23 + 6/6 + p3-review 27 PASS/0 SNAG/0 FAIL/2 DEFER after the 2-mode deploy.

## Open items

0. 🔜 **PLANNED + OWNER-AGREED 2026-09-22 — RBAC levels + Admin Settings→Content reorg (rides OTA, no bump):** roles become `customer / staff / admin / owner`; staff = all admin powers EXCEPT deletions; delete-user is **owner-only** (`genumsolutions`); website + app admin tabs both move Training programs / Pilot cost lines / Curriculum highlights from **Settings → Content**, rebuilt as the unified windowed editors (list + editor pane + Preview / Edit / Hide / Delete like Products/Services/Projects); Settings keeps company info only; delete buttons hidden for staff. Website roots the whole effort (`cleanup-test-residue.mjs`, `lib/admin.ts`, schema, edge, routes, AdminContent/AdminUsers) — mirror into this app via `AppContext` role (`isStaff/isOwner`), `AdminScreen` gating + Content panels, `adminService` delete-user.

1. ⏳ **OWNER: install 3.2.5/58 on the test devices** → via the in-app updater prompt
   (3.2.3/3.2.4 installs ARE offered 3.2.5 — the prompt appearing is EXPECTED, it is the
   R-20a updater working) or sign in on the web /app page (download is now
   **registered-only**) and sideload. After install verify:
   - App sections show the **native installed version 3.2.5 (58)**.
   - **Launcher icon = the company stamp.**
   - **§5B device rows E-1..E-7** in `guide/DEVICE-RERUN-2026-09-21.md` — the new
     tier/robot-preference checks (download gate, remote pro gate, tier flip, preferences
     CRUD + web mirror + admin reach, downgrade behaviour).
   - Prior P6 checks still apply: admin role grant/revoke works; no stale "update
     available"; R-20 drive changes; 2WD1M editor stays gone.
   - Then run `guide/DEVICE-RERUN-2026-09-21.md` (retargeted to 3.2.5/58 2026-09-22).
2. ✅ **RELEASE-NOTES-DRAFT.md** (FIN-35) — refreshed to the released **3.2.5/58**
   2026-09-22 (tier + robot-preference bullets added on top of the P6 bullets).
3. 🔜 **FIN-36:** version-defining commits — app **`v3.2.5` → `5fd10b1`** (the bump
   commit), website **`website-v3.2.5` → `7bb6cb5`** (bot fallback-sync commit).
   **Re-staged twice 2026-09-22** (3.2.4 → 3.2.5 the same day, before any tag was cut);
   `guide/FIN-36-TAGS.sh --dry-run` re-passed all six 2026-09-22. Firmware targets
   unchanged (v1.6.6 / v1.0.10 / v1.8.3 / v1.2.5). Cut ONLY after the device gate passes.
4. 🌉 **ECOSYSTEM UNIFICATION:** P1–P5 DONE + pushed (see guide/ARCHITECTURE.md);
   W-6 + W-3 live; P3 machine review 27 PASS · 0 SNAG · 0 FAIL · 2 DEFER (owner visual
   pass still open — `guide/P3-REVIEW-CHECKLIST-2026-09-21.md`). **2026-09-22 adds the
   account/permission layer**: tiers + per-user robot prefs are now a shared, admin-
   managed store across app + web (one table, one API contract, both UIs).
5. 🧹 **Residue cleanup (2026-09-22) — DONE this round:** removed
   `AutonomousControls.tsx`, `WeblinkControls.tsx` (both retired by `RouterPanel`),
   `ModeInfo.tsx`, `deviceMemoryService.ts`, `carModeStorage.ts` + their dead prop types.
   Website removed unreferenced `ProjectCard.tsx`. No other orphans found (`.web.tsx`
   platform files and vitest-discovered tests are false positives — verified).
6. 🌗 **Theme parity `78e10f9` (2026-09-22):** ✅ **CONFIRMED 2026-09-23 — OTA run
   35709327384 GREEN.** CI is fully green back to the bump (the only red runs —
   M3 `add unit tests`/`update audit` CI+OTA — were repaired by the 2026-09-23
   test-fix push `ea4d07e`, CI 35818092418 + OTA 35818092425). Flag to the owner:
   the app's own native Settings theme switch still offers its **System/OS-follow**
   option (kept by design, native OS-follow); the website System state was the one
   removed per owner decision #1 — if the app Settings control should also drop
   System, that is a small follow-up.

## Do-not-regress (the R-20a lessons)

- NEVER pass `idempotent: true` for the APK download target, and never use a
  fixed filename — cache poisoning was the entire "old version forever" bug.
- NEVER hardcode `runtimeVersion` again — `appVersion` policy keeps OTA
  bundles pinned to their own native release.
- Version LABELS use `installedAppVersion()` (expo-constants), not
  `APP_VERSION` — the JS constant drifts after installs/OTAs.
- OTA push discipline unchanged: JS-only pushes ride ota-only.yml; version
  bumps always ride the APK (release.yml skips OTA on bump pushes — correct).
- NEW (2026-09-22): tier checks live in AppContext (`isPro`) — never read
  `profiles.tier` ad hoc from screens; the pro gate on RemoteControlScreen is an
  early return BEFORE any transport UI mounts.

## 2026-09-23 — advanced round (Phases A/B/C)

**Commits:** app `87ff579` (C9 hygiene).

**Phase A:** app `ProductsTab` gains `fromLink` prop; `ProductEditor` label becomes **"Save imported product"** while `pendingImportUrl` set; extracted-image thumbnail shown above the Image URL input; `createLinkImport` path unchanged (edge `action: create` still supported).

**Phase B:** app admin mirrors web admin anatomy (parity test `tests/admin-parity.test.ts` pins `TABS` order+IDs — web tab strip grouped with icons + ARIA). App side: no structural change needed beyond the Phase A `fromLink` support.

**Phase C9:** `mobile/package.json` gains `lint:check` (`tsc --noEmit`), `format`/`format:check` (`prettier`) scripts; `prettier`/`husky`/`lint-staged` added to devDeps; `.husky/pre-commit` (`npx --prefix mobile lint-staged`) + `.lintstagedrc` at repo root; `mobile/package.json` has `"prepare": "husky"` so `npm install` creates `.git/hooks/pre-commit` for new contributors; stale `mobile/.husky/pre-commit` removed. Keystore (`mobile/keystores/keystore.properties`, `genum-release.jks`) confirmed gitignored (`/keystores/`) with `plugins/with-release-signing.js` reading from `../keystores/keystore.properties` and falling back to debug signing.

**Gates:** app tsc 0 · vitest 140/140. Live harnesses green.

## 2026-09-24 — R6 UX audit round (code-path walkthrough)

**Fixed:** Journal "Get in touch about this" was a dead button (`onPress={}`) —
now pushes Contact (mirrors web `/contact` CTA); trend-brief WEF/IFR/UNESCO
links were inert text — now open via Linking (mirrors web). CartScreen no
longer shows "Your cart is empty" when the catalog fetch fails — honest
offline/can't-verify state instead.

**Fixed (deployed edge fns, shared with web):** `contact` + `site-content` were
never deployed (404) and then crashed on `NEXT_PUBLIC_*` env names — app
contact submissions now persist + succeed; home hero loads from `site_content`
DB row with bundled fallback. Lesson (repeat of C1): edge functions must fall
back to standard `SUPABASE_URL`/`SUPABASE_ANON_KEY` names AND must be in the
deploy list for every release.

**Verified:** navigation graph covers every web destination; cart→checkout→
success guards sound; payment deep-link states present.

**Gates:** tsc 0 · vitest 180/180 · prettier clean.
