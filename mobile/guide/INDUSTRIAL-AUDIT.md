# Industrial-Readiness Audit — Both Repos
## Date: 2026-09-10

---

## MOBILE APP (`genumsolutions-app/mobile`) — Score: 7/10

### P0 — Fix Before Production

| # | Category | Issue | File |
|---|----------|-------|------|
| M1 | Security | Session stored in AsyncStorage (unencrypted). Set `persistSession: false` — rely on SecureStore in authService only | `src/config/supabase.ts:43-44` |
| M2 | Security | Keystore passwords in plaintext on disk. Move to env vars or secrets manager | `keystores/keystore.properties` |
| M3 | Testing | Zero test coverage. Add unit tests for carProtocol, cartService, updateService, roboCarCatalog | All `src/` |
| M4 | DevOps | No CI/CD workflows. Add typecheck + lint on PR, release build on tag | `.github/workflows/` |

### P1 — Fix Within 2 Weeks

| # | Category | Issue | File |
|---|----------|-------|------|
| M5 | Bug | `upload-release.mjs` references undefined `versionedUrl` before it's declared | `scripts/upload-release.mjs:122` |
| M6 | Security | `package.json` version `2.0.5` vs `app.json` `2.0.6` — out of sync | `package.json:3` |
| M7 | Performance | AppContext has 20+ deps — full tree re-renders on any state change. Split into Auth/Cart/Theme contexts | `src/context/AppContext.tsx:373-426` |
| M8 | Performance | useControlHub is 829 lines — monolithic hook. Split into useSppConnection, useWifiConnection, useCarState, usePidControl | `src/components/tools/useControlHub.ts` |
| M9 | Code Quality | No lint/format/test scripts in package.json | `package.json:55-63` |
| M10 | Code Quality | No pre-commit hooks (husky + lint-staged) | Root |

### P2 — Fix Within 1 Month

| # | Category | Issue | File |
|---|----------|-------|------|
| M11 | Security | Hardcoded Edge Function URLs duplicated in 2 files | `orderService.ts:13`, `adminService.ts:13` |
| M12 | UX | No skeleton screens — all loading states are spinners | All screens |
| M13 | Performance | Images loaded without caching (no expo-image) | `ShopScreen.tsx:166-169` |
| M14 | Performance | FlatList without getItemLayout | `ShopScreen.tsx:120` |
| M15 | Accessibility | Missing accessibilityLabel on AccountScreen buttons | `AccountScreen.tsx` |
| M16 | UX | No pull-to-refresh on AccountScreen | `AccountScreen.tsx` |
| M17 | UX | Client-side pagination — fetches ALL products | `ShopScreen.tsx:38-47` |
| M18 | Code Quality | Silent error swallowing — no logging in catch blocks | Multiple services |

### What's Already Good
- Error boundaries on every screen
- Comprehensive offline fallback strategy (DB → AsyncStorage → bundled)
- NativeWind dark/light theming
- Release tooling (bump-version, upload-release, sync-version)
- Security model (anon key in app, service role only in scripts)
- Accessibility labels on IoT/remote components
- AGENTS.md documentation

---

## WEBSITE (`genumsolutions-website`) — Score: 8.5/10

### P0 — Fix Before Production

| # | Category | Issue | File |
|---|----------|-------|------|
| W1 | DevOps | No error monitoring. Add Sentry integrated with `global-error.tsx` | `app/global-error.tsx` |

### P1 — Fix Within 2 Weeks

| # | Category | Issue | File |
|---|----------|-------|------|
| W2 | Performance | Dashboard loads ALL orders/products into memory for counts. Use SQL COUNT | `lib/analytics.ts:107-111` |
| W3 | Performance | Page view stats aggregate in JS — should use SQL GROUP BY | `lib/analytics.ts:36-44` |
| W4 | Performance | Product list fetched 3x per detail page. Cache within request | `app/products/[slug]/page.tsx:16,33` |
| W5 | Testing | No API route tests for payment, auth, cart flows | `tests/` |
| W6 | DevOps | No `npm audit` step in CI | `.github/workflows/ci.yml` |

### P2 — Fix Within 1 Month

| # | Category | Issue | File |
|---|----------|-------|------|
| W7 | Security | Rate limiting is in-memory — won't work in multi-instance. Use Redis/Upstash for production | `lib/rate-limit.ts` |
| W8 | Testing | No E2E tests (Playwright) for purchase flow | Root |
| W9 | Accessibility | Mobile nav menu doesn't trap focus when open | `components/SiteHeader.tsx:62-73` |
| W10 | Performance | `force-dynamic` on product pages defeats ISR | `app/products/[slug]/page.tsx:13` |
| W11 | SEO | No `loading.tsx` for `/products/[slug]` | `app/products/[slug]/` |
| W12 | Code Quality | Multiple console.error without structured logging. Add pino/winston | Multiple files |
| W13 | DevOps | GitHub Actions version inconsistency (@v4 vs @v5) | `.github/workflows/` |

### P3 — Backlog

| # | Category | Issue | File |
|---|----------|-------|------|
| W14 | Security | CSP allows unsafe-inline for script/style (Next.js trade-off) | `next.config.mjs:45-46` |
| W15 | SEO | No hreflang tags (currently English-only) | `app/layout.tsx` |
| W16 | DevOps | No database backup strategy documented | Root |
| W17 | UX | No toast/notification system | Root |
| W18 | UX | No search on homepage — must navigate to /products | `app/page.tsx` |

### What's Already Good
- Comprehensive CSP + security headers
- Server-side price re-pricing on checkout
- Payment confirmation is server-to-server with amount verification
- Rate limiting on all API routes
- RLS on every table + role protection trigger
- Full SEO: metadata, sitemap, robots.txt, JSON-LD, semantic HTML
- Accessibility: skip-to-content, ARIA, focus-visible, reduced-motion
- Strict TypeScript: noUncheckedIndexedAccess, noUnusedLocals
- CI with typecheck + lint + tests + secret scanning
- Offline support with service worker
- Dark mode with flash-free loading

---

## SHARED — Both Repos

| # | Category | Issue | Repos |
|---|----------|-------|-------|
| S1 | Testing | Both need more test coverage (unit + E2E) | Both |
| S2 | DevOps | Neither has error monitoring (Sentry) | Both |
| S3 | Security | `.env.local` with real credentials on disk — rotate if ever shared | Both |
| S4 | Code Quality | No structured logging in either repo | Both |
