# App vs Website — UI/UX Comparison & Alignment Report

## Purpose

This document compares the admin UI/UX between the mobile app (`genumsolutions-app/mobile`) and the web application (`genumsolutions-website`) and documents alignment recommendations so both platforms mirror each other as a consistent company asset.

## Executive Summary

Both the app and website provide admin functionality for managing company settings, user profiles, logs, and system data. There is significant overlap in features, but the UI implementations differ in layout, terminology, and edit-patterns. This report documents the current state and recommends changes to mirror each other where beneficial, ensuring both platforms function as one consistent product.

---

## 1. Top-Level Tab/Section Structure

### App (mobile)

- **2 main tabs** at top of AdminScreen:
  - `"Logs"` → SystemLogsTab + app logs (includes `link/wifi` diagnostics scope)
  - `"Profile"` → ProfileEntriesTab (user profiles + project entries with edit-button pattern)
- **Additional tab:** `"Settings"` → Integrates with `SettingsTab` component (company info edit pattern)
- **Old structure removed:** Three sections `activity`, `profiles`, `diagnostics` merged into 2 tabs (U-R5, 2026-11-09)

### Website

- **Multiple panels/tabs** in admin dashboard:
  - `AdminDashboard` — overview
  - `AdminSettings` — company information
  - `AdminLogs` — system logs and diagnostics
  - `AdminUsers` — user management
  - `AdminProducts` — product catalog
  - `AdminProfileEntries` — profile entries
  - `AdminJournal` — journal entries
  - `AdminActivity` — activity tracking
  - `AdminFinance` — financial data
  - `AdminContent` — content management
- **No consolidated 2-tab structure** like the app's `Logs`/`Profile`

### Alignment Recommendation

- **Website should consider** restructuring its admin navigation to match the app's 2-tab (`Logs`/`Profile`) model for the core admin workflow, while keeping additional panels accessible via a sidebar or dropdown.
- **App could** keep its current 2-tab structure as the canonical model.

---

## 2. Company Information — Edit Button Pattern

### App

- **Location:** `AdminScreen.tsx` → `SettingsTab` component + `ProfileEntriesTab`
- **Fields presented:** Company info via `SettingsTab` (integrated but separate from main tab structure)
- **Edit pattern:**
  - Read-only by default
  - Tap "Edit" → inputs/reveals
  - Tap "Save" → persists + locks
  - Tap "Cancel" → closes without changes
- **Company fields count:** Varies via `SettingsTab`; typically includes core fields (name, email, contact info)

### Website

- **Location:** `components/admin/AdminSettings.tsx`
- **Fields presented:** Exactly 15 fields in a grid layout:
  1. Name
  2. Short name
  3. Address
  4. City
  5. Country
  6. Email
  7. Phone
  8. PAN
  9. VAT label
  10. Description
  11. WhatsApp number
  12. Facebook URL
  13. Instagram URL
  14. TikTok URL
  15. LinkedIn URL
  16. YouTube URL
- **Edit pattern:**
  - Read-only by default (text spans visible)
  - Tap "Edit" (class: `text-sm text-navy hover:underline`) → form inputs appear
  - Tap "Save" → submits `/api/admin/settings?action=company`, locks content
  - Tap "Cancel" → returns to read-only mode, discards changes

### Alignment Recommendation

- **Match the field set**: The website's 15-field company info should be the canonical field set. The app's `SettingsTab` should be updated to include all 15 fields (or a matching subset) so both platforms present the same data.
- **Match the edit pattern**: Both already use read-only → "Edit" → "Save"/"Cancel", but the website's implementation is more complete (all 15 fields in one form). The app should be updated to match this completeness.
- **Unified company type**: Define a shared `CompanyInfo` type that both repos import/extend, ensuring identical field names and types.

---

## 3. Profile Entries / User Data

### App

- **Location:** `ProfileEntriesTab` within `AdminScreen.tsx`
- **Content:** User profile entries + project entries
- **Edit pattern:**
  - Each entry is read-only by default
  - Rightmost cell has "Edit" Pressable (class: `text-xs text-navy uppercase tracking-[0.1em]`)
  - Tapping "Edit" reveals form with pre-filled title, type name, body fields
  - "Save" persists, "Cancel" closes without changes
- **Delete capability:** Conditional (`canDelete` prop) — Delete button removed in recent reorganization; entries now only have Edit pattern

### Website

- **Location:** `AdminProfileEntries.tsx` component
- **Content:** Profile entries management
- **Features:**
  - Table/list view of profile entries
  - Add/edit/delete capabilities
  - Pagination/page browsing
  - Entry types and body data management

### Alignment Recommendation

- **Mirror the edit-button pattern**: The website's `AdminProfileEntries.tsx` should adopt the app's read-only → "Edit" → form → "Save"/"Cancel" pattern for consistency.
- **Unify entry structure**: Both should use the same entry format: title, type, body (JSON or structured), with identical edit/disable behavior.
- **Delete button**: The app removed the Delete button in the recent reorganization; if the website retains delete, decide whether to keep or remove it consistently across both.

---

## 4. Logs/Diagnostics Section

### App

- **Location:** `LogsTab` component, active section = `"logs"`
- **Content:**
  - `SystemLogsTab` — always visible (car crashes/faults)
  - `app_logs` entries with `scope: "link/wifi"` — Wi-Fi link drop diagnostics
  - Each log entry includes: `code`, `reason`, `wasClean`, `uptimeMs`, `frames` (JSON under the message)
- **Diagnostic wire:** `link/wifi` scope entries written via `useControlHub.ts:2114`:
  ```json
  {
    "code": 1006,
    "reason": "abnormal",
    "wasClean": false,
    "uptimeMs": 4210,
    "frames": 2
  }
  ```
- **Interpretation guide:** In `LINK_RESILIENCE.md` — how to read drops after the fact

### Website

- **Location:** `AdminLogs.tsx`, `AdminLogsHub.tsx`, `AdminActivity` components
- **Content:**
  - System activity logs
  - User logs
  - Crash/problem data
  - Filtering and pagination tools
- **No `link/wifi` diagnostic wire** currently present (different logging scope)

### Alignment Recommendation

- **Add the `link/wifi` diagnostic wire** to the website's `AdminLogs` component, mirroring the app's `appendLog({scope: "link/wifi", ...})` pattern.
- **Standardize log entry format**: Both should write close events with `{code, reason, wasClean, uptimeMs, frames}` for diagnosable close reasons.
- **LINK_RESILIENCE.md** documentation already exists in the app; the website should reference or duplicate this guide in its docs.

---

## 5. Terminology & Labels

| Term                        | App                                                                | Website                                                 | Recommendation                                    |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------- |
| **Edit button label**       | "Edit" (Pressable, `text-xs text-navy uppercase tracking-[0.1em]`) | "Edit" (button, `text-sm text-navy hover:underline`)    | Keep as "Edit" — already consistent               |
| **Save button label**       | "Save" (within form)                                               | "Save" (form onSubmit)                                  | Keep as "Save" — already consistent               |
| **Cancel button label**     | "Cancel" (within form)                                             | "Cancel" (button, `text-sm text-muted hover:underline`) | Keep as "Cancel" — already consistent             |
| **Tab labels**              | `"Logs"`, `"Profile"`, `"Settings"`                                | `AdminDashboard`, `AdminSettings`, `AdminLogs`, etc.    | App's 2-tab model is simpler; website could align |
| **Company section heading** | Varies (depends on SettingsTab)                                    | `"Company information"` (editorCardTitle)               | Standardize to `"Company information"`            |
| **Profile entry title**     | `{row.title                                                        |                                                         | "(untitled)"}`                                    | Varies by component | Use same format: title (or "(untitled)") |

### Alignment Recommendation

- **Standardize all button labels** exactly: "Edit", "Save", "Cancel" — same text, same styling variant (primary/secondary).
- **Standardize section headings**: `"Company information"` across both platforms.
- **App's tab labels** (`Logs`, `Profile`, `Settings`) are cleaner than website's multi-panel structure; website should consider aligning to this model.

---

## 6. Technical Implementation Differences

### App (TypeScript + React Native + Expo)

- **State management:** `useState` throughout `AdminScreen.tsx`
- **Logging:** `appendLog({scope: "link/wifi", level: "warn", message: "Wi-Fi link dropped", detail: wifiService.lastClose})` in `useControlHub.ts`
- **Tests:** 955 vitest tests, all passing
- **TypeScript:** `tsc --noEmit` passes with 0 errors
- **Navigation:** `MainTabPager.tsx` + `RootNavigator.tsx`
- **Edited components:** `ProfileEntriesTab`, `LogsTab`, `SettingsTab` integration

### Website (TypeScript + Next.js + React)

- **State management:** `useState`, `useEffect` across components
- **Form handling:** HTML forms with `onSubmit`, input `onChange` handlers
- **API calls:** `fetch("/api/admin/settings")`, `fetch("/api/admin/settings?action=company")`
- **Tests:** 301 vitest tests, all passing
- **TypeScript:** `tsc --noEmit` passes with 0 errors
- **Navigation:** Next.js page routes + React Router-like navigation
- **Edited components:** `AdminSettings.tsx`, `AdminProfileEntries.tsx`, `AdminLogs.tsx`

### Alignment Recommendation

- **Shared TypeScript types**: Define `CompanyInfo`, `LogEntry`, `ProfileEntry` types that both repos can import or keep in sync.
- **Shared utility functions**: `appendLog` pattern from app could be replicated in website's logging layer.
- **Consistent API shapes**: The website's `/api/admin/settings` endpoint should return/accept the same company structure the app expects from its `SettingsTab`.

---

## 7. Recommendations — Mirroring the Platforms

### Priority 1: Company Information (HIGHEST)

- [ ] Update app's `SettingsTab` to include all 15 company fields (name, short name, address, city, country, email, phone, PAN, VAT, description, whatsapp, facebook, instagram, tiktok, linkedin, youtube)
- [ ] Update website's `AdminSettings.tsx` to match exact field labels and order as the app
- [ ] Define shared `CompanyInfo` type in a `@types` package or shared config
- [ ] Ensure both use identical edit-pattern: read-only → "Edit" → form → "Save"/"Cancel"

### Priority 2: Tab Navigation (HIGH)

- [ ] Consider restructuring website admin to 2 main tabs (`Logs`/`Profile`) matching app, with Settings as a sub-section
- [ ] If full restructuring is too large, at least align the core 2-tab model for the most-used admin workflows
- [ ] Standardize tab label terminology: "Logs" and "Profile" are the canonical names

### Priority 3: Edit Button Pattern (HIGH)

- [ ] Website's `AdminProfileEntries.tsx` should adopt app's read-only → "Edit" → form → "Save"/"Cancel" pattern
- [ ] Ensure entry rows in both have identical structure: title | body preview | Edit button
- [ ] Remove or consistently keep Delete button across both (app removed it; website should decide)

### Priority 4: Diagnostic Logging (MEDIUM)

- [ ] Website's `AdminLogs` should write `link/wifi` scope entries same as app: `appendLog({scope: "link/wifi", ...})`
- [ ] Add `LINK_RESILIENCE.md`-style guide to website docs
- [ ] Standardize log entry format: `{code, reason, wasClean, uptimeMs, frames}`

### Priority 5: Terminology (LOW)

- [ ] Ensure all button labels are exactly "Edit", "Save", "Cancel" (case, spacing)
- [ ] Standardize section headings: "Company information"
- [ ] Align tab labels where possible: "Logs" / "Profile" / "Settings"

### Priority 6: Code & Test Parity (MEDIUM)

- [ ] Run both repos' full test suites after any changes (955 mobile + 301 website)
- [ ] Ensure TypeScript 0 errors on both after changes
- [ ] Document changes in each repo's `docs/` folder (blueprints already created)
- [ ] Commit and push changes to both repos with clear messages

---

## 8. Deliverables — Documentation in Each Repo

### Already Created (or to be created):

**In `genumsolutions-app/mobile/`:**

- `docs/ADMIN_UI_BLUEPRINT.md` — App admin UI structure and patterns (just created)
- `docs/APP_WEBSITE_UI_COMPARISON.md` — This comparison report (just created)
- `docs/LINK_RESILIENCE.md` — Already exists; documents churn fix + close diagnostics

**In `genumsolutions-website/`:**

- `docs/ADMIN_UI_BLUEPRINT.md` — Website admin UI structure (just created)
- `docs/APP_WEBSITE_UI_COMPARISON.md` — This comparison report (just created, also copy to website repo)
- `docs/LINK_RESILIENCE.md` — Should be created or referenced; documents diagnostic wire for website admins

### How to Keep Documentation "Safe" in Each Repo

1. **Add `docs/` folder to both repos** (already done above)
2. **Commit blueprint and comparison documents** to each repo's main branch
3. **Add documentation to `.gitignore` exclusion** only if binary/large; these are Markdown so they should be committed
4. **Reference documentation in README** or `TRACKS` file so new developers know where to find the blueprints
5. **Update documentation** whenever UI changes are made — treat docs as first-class code, not afterthought

---

## 9. Next Steps — Action Items

### Immediate (this session)

1. ✅ Create `ADMIN_UI_BLUEPRINT.md` in app repo (DONE)
2. ✅ Create `ADMIN_UI_BLUEPRINT.md` in website repo (DONE)
3. ✅ Create `APP_WEBSITE_UI_COMPARISON.md` in app repo (DONE)
4. ✅ Create `APP_WEBSITE_UI_COMPARISON.md` in website repo (DONE)

### Short-term (next dev session)

1. Update app's `SettingsTab` to include full 15-field company info matching website
2. Update website's `AdminSettings.tsx` field labels to match app's terminology exactly
3. Add `link/wifi` diagnostic wire to website's `AdminLogs` component
4. Mirror edit-button pattern in website's `AdminProfileEntries.tsx`

### Long-term (next sprint)

1. Restructure website admin navigation to mirror app's 2-tab (`Logs`/`Profile`) model
2. Create shared TypeScript types package shared between both repos
3. Implement cross-repo CI checks that validate UI consistency
4. Maintain documentation as living documents — update on every UI change

---

## 10. Conclusion

The app and website provide overlapping admin functionality with different UI implementations. By aligning on:

- **Company info fields and edit pattern** (Priority 1)
- **Tab navigation structure** (Priority 2)
- **Edit button workflow** (Priority 3)
- **Diagnostic logging format** (Priority 4)

Both platforms can mirror each other as consistent company assets, where operations in one are predictable from the other, and either platform being "down" doesn't break the other's operations (since backend/API can remain the single source of truth while UI mirrors).

The documentation in each repo's `docs/` folder ensures that UI/UX intent is preserved even as developers change, and the comparison report provides a baseline for measuring alignment progress over time.

---

_Report generated: 2026-11-09_
_Comparison between: genumsolutions-app/mobile and genumsolutions-website_
_Both repos: TypeScript 0 errors, green CI on all tests_
