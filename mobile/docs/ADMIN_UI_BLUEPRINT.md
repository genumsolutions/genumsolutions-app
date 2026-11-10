# App (genumsolutions-app/mobile) — Admin UI Blueprint

## Overview

Admin screen located at `src/screens/AdminScreen.tsx`. Provides a centralized admin
console for the shared Supabase data: orders, the three catalogs, projects, site
content, users and their fleet profiles, diagnostics, and company settings.

Strictly read-only for staff: `isAdmin` means admin-or-owner (deletion rights) and only
the sole owner may delete users.

## Top-Level Tab Navigation

The top bar is a horizontally scrolling strip of pill buttons driven by the `TABS`
array (`AdminScreen.tsx` line ~158). There are **nine** tabs, in this order:

| #   | Tab (`Tab` union member) | Content component                                                |
| --- | ------------------------ | ---------------------------------------------------------------- |
| 1   | `Dashboard`              | KPIs, order/revenue trend, recent activity                       |
| 2   | `Orders`                 | Every order, payment state, pilot finance lines                  |
| 3   | `Electronic Products`    | The `/products` catalog — pricing, stock, photos                 |
| 4   | `3D Products`            | The `/3d-printing` catalog                                       |
| 5   | `Projects`               | Bundles sold on `/projects`, including pre-packaged kits         |
| 6   | `Content`                | Services, journal posts, home page copy                          |
| 7   | `Users`                  | Accounts, roles, tiers, plus the car- and robot-profile sections |
| 8   | `Logs`                   | Diagnostics — see the inner sections below                       |
| 9   | `Settings`               | Company info, training programs, pilot costs                     |

- Active tab state: `const [tab, setTab] = useState<Tab>("Dashboard")` — the console
  opens on **Dashboard**.
- **Profile is not a tenth tab.** It is an inner section of the Logs tab (next heading).

**Structure history:** the old top-level `activity`, `profiles` and `diagnostics` tabs
were merged into the single `Logs` tab by U-R5 (2026-11-09). A later doc revision
mistakenly collapsed that merge into a "two-tab admin" (Logs + Profile); the bar has
been the nine tabs above since U-R5, and this file was corrected to match the code.

## Logs Tab — two inner sections (`LOG_SECTIONS`)

Inside the Logs tab, a second row of pills selects the section. These are the
`LOG_SECTIONS` entries, and the initial section is `"logs"`:

```ts
const LOG_SECTIONS = [
  { id: "logs", label: "Logs" },
  { id: "profile", label: "Profile" },
] as const;
type LogSection = (typeof LOG_SECTIONS)[number]["id"];
```

- State: `const [section, setSection] = useState<LogSection>("logs")` inside `LogsTab`.
- Pill styling: `rounded-full border px-3.5 py-1.5`, active is `border-navy bg-navy`
  with white text (`text-[11px] font-black`); each pill sets `accessibilityState.selected`.

**`logs` section → `SystemLogsTab`**, which renders two blocks in one scroll view:

1. **Car crash / restart reports** — one row per connection session, synced by the app
   from each car's stored restart record. Empty state: "No crash reports synced yet."
   with an `alert-triangle` icon.
2. **App logs** — the `app_logs` rows, including the `link/wifi` diagnostic scope.

Both blocks are paginated (`crashPage`/`crashTotalPages`, `logPage`/`logTotalPages`)
and both respect `canDelete`.

**`profile` section → `ProfileEntriesTab`** — the edit-button pattern below.

## Tab Styling & Width

- Tab widths are **measured**, not assumed: the active tab is centred from collected
  offsets (`tabOffsets.current[index] ?? index * TAB_MIN_WIDTH`) so it never drifts,
  because labels differ in length ("Electronic Products" vs "Logs").
- `TAB_MIN_WIDTH = 96` is the minimum width floor passed as `style={{ minWidth }}`.
- This was U-UI1 (2026-11-09); the old code multiplied a fixed width per tab.

## Settings Tab

- Tab labelled `Settings`; renders the `SettingsTab` component with `company`,
  `setCompany`, `canDelete`, `onCompanySaved`, and
  `onEditingChange={setSettingsEditing}`.
- Company info is read-only by default; **Edit** reveals inputs, **Save** / **Cancel**
  locks again — the same pattern as `ProfileEntriesTab`.

## Biometric Admin Lock (C7)

Local opt-in, enabled from **Menu → Security** (`loadBiometricsPref`). When enabled,
`AdminScreen` authenticates on entry via `biometricAuthenticate("Unlock the admin
console")`; if the device reports no biometric support after the pref was turned on,
the pref is cleared rather than locking the operator out. See `biometricsService`.

## ProfileEntriesTab — Edit Button Pattern

**Location:** `src/screens/AdminScreen.tsx`, `ProfileEntriesTab` component. Reached via
Logs → the `profile` pill.

**State:**

- `isEditing: boolean` — `false` by default (read-only mode)
- `newTitle: string` — pre-filled title when editing
- `newTypeName: string` — pre-filled type name
- `newBody: Record<string, unknown>` — pre-filled body data

**Read-only mode (`isEditing = false`):**

- Each entry is a read-only `View` with a title and a body preview.
- The rightmost cell holds a `Pressable` labelled "Edit"
  (`text-xs text-navy uppercase tracking-[0.1em]`); tapping it sets `isEditing = true`.

**Editing mode (`isEditing = true`):**

- The form reveals three fields: `newTitle`, `newTypeName`, `newBody`.
- **Save** persists and sets `isEditing = false`; **Cancel** closes without saving.
- Form fields can be cleared / reset.

**Entry row structure:**

- `View` laid out `flex-row items-center gap-2`.
- Left: `Text` with `{row.title || "(untitled)"}` (`text-sm font-bold text-ink`).
- Middle: `Text` with the JSON body preview.
- Right: the "Edit" `Pressable`, or the Save/Cancel controls while editing.

## Admin Screen Structure Summary

```
AdminScreen.tsx
├── Top tab bar — TABS (9): Dashboard · Orders · Electronic Products · 3D Products
│   · Projects · Content · Users · Logs · Settings        [default: "Dashboard"]
├── Active tab content (TABS.map → component)
│   ├── "Logs"    → LogsTab
│   │              ├── LOG_SECTIONS pills: [ Logs | Profile ]
│   │              ├── "logs"    → SystemLogsTab (crash reports + app logs)
│   │              └── "profile" → ProfileEntriesTab (edit-button pattern)
│   └── "Settings" → SettingsTab (company info edit pattern)
└── C7 biometric admin lock — interposed before entry when opted in
```

## Key Constants & Types

- `TABS`: the nine `Tab` union members listed above.
- `Tab`: union of those nine names.
- `LOG_SECTIONS`: `[{ id: "logs", label: "Logs" }, { id: "profile", label: "Profile" }]`
- `LogSection`: `(typeof LOG_SECTIONS)[number]["id"]`
- `TAB_MIN_WIDTH`: `96` (minimum tab width; actual offsets are measured)

## Edit-Button Pattern (Reusable)

Used by `ProfileEntriesTab`, `SettingsTab`, and the car/robot profile sections in the
Users tab — and, on the website, by `AdminSettings` and `AdminUsers`:

1. Content displays **read-only** by default.
2. The user taps **Edit** → form / inputs become active and pre-filled.
3. The user taps **Save** → changes persist, content locks.
4. The user taps **Cancel** → form closes, content returns to read-only (no changes).
5. While saving, a busy flag disables Save.
6. Permissions differ by action, and the platform splits them differently:
   - **App:** staff may still _edit_, while deletions are gated by
     `canDelete = isAdmin` — every delete handler early-returns when `!canDelete`,
     and `canDelete` is passed down to the list components.
   - **Website:** `AdminUsers` additionally disables the Edit control for staff with a
     tooltip naming the restriction. That tooltip is a website behaviour; the app does
     not have it, so do not read this line as describing both.

This keeps editing predictable across both clients: the same gesture everywhere.
