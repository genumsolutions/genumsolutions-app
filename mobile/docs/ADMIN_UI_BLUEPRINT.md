# App (genumsolutions-app/mobile) — Admin UI Blueprint

## Overview

Admin screen located at `src/screens/AdminScreen.tsx`. Provides centralized admin dashboard for managing company settings, user profiles, logs, and system configuration.

## Top-Level Tab Navigation

Primary navigation at the top of the admin screen. Tabs are defined in `LOG_SECTIONS` constant and rendered as pill-shaped buttons.

| Tab ID      | Label     | Content                                                                                                                          |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `"logs"`    | `Logs`    | System logs + App logs (includes `link/wifi` diagnostics). Initial section state: `"logs"`.                                      |
| `"profile"` | `Profile` | User profiles + project entries. Uses edit-button pattern: read-only by default, tap "Edit" reveals form, "Save"/"Cancel" locks. |

**Old tabs (removed):** `activity`, `profiles`, `diagnostics` — merged into the two-tab structure above.

## Tab Styling & Width

- Tab widths are measured dynamically, not assumed 96px per tab.
- `TAB_MIN_WIDTH = 96` constant used for layout calculations.
- Active tab centered using calculated widths rather than fixed widths.

## ProfileEntriesTab — Edit Button Pattern

**Location:** `src/screens/AdminScreen.tsx` within `ProfileEntriesTab` component.

**State:**

- `isEditing: boolean` — `false` by default (read-only mode)
- `newTitle: string` — pre-filled title when editing
- `newTypeName: string` — pre-filled type name
- `newBody: Record<string, unknown>` — pre-filled body data

**Read-Only Mode (isEditing = false):**

- Each entry displays as read-only `View` with title and body preview
- Rightmost cell contains a `Pressable` with label "Edit" (class: `text-xs text-navy uppercase tracking-[0.1em]`)
- Tapping the "Edit" Pressable sets `isEditing = true`, revealing the form

**Editing Mode (isEditing = true):**

- Form reveals with three fields: `newTitle`, `newTypeName`, `newBody`
- "Save" button persists changes and sets `isEditing = false`
- "Cancel" button closes the form without saving, sets `isEditing = false`
- Form fields can be cleared/reset

**Entry Row Structure:**

- `View` with `flexRow items-center gap-2` layout
- Left: `Text` showing `{row.title || "(untitled)"}` (text-sm font-bold text-ink)
- Middle: `Text` showing JSON preview of body
- Right: "Edit" Pressable (when not editing) or Save/Cancel inputs (when editing)

## SystemLogsTab

- Displays `SystemLogsTab` with `crashes` prop (always visible, regardless of active tab)
- Contains crash/fault logging data from the car system

## LogsTab Section State

- `const [section, setSection] = useState<LogSection>("logs")`
- Only two sections: `"logs"` and `"profile"`
- `"logs"` section shows `SystemLogsTab` (crashes) — `"profile"` section shows `ProfileEntriesTab`

## Settings Tab

- Tab labeled `"Settings"` in the top tab bar
- Integrates with `SettingsTab` component (imported from external)
- Passes: `company`, `setCompany`, `canDelete`, `onCompanySaved`, `onEditingChange={setSettingsEditing}`
- Company info displays read-only by default; "Edit" reveals inputs, "Save"/"Cancel" locks (same pattern as ProfileEntriesTab but for company info)

## Admin Screen Structure Summary

```
AdminScreen.tsx
├── Top tab bar: ["Dashboard", "Orders", ..., "Logs", "Settings"]
│   - Active tab controlled by useState
│   - Two main tabs: "Logs" and "Profile" (U-R5 reorganization)
│   - "Settings" tab passes data to SettingsTab component
├── Active tab content
│   - "Logs" → SystemLogsTab + app logs (link/wifi diagnostics)
│   - "Profile" → ProfileEntriesTab (edit-button pattern)
│   - "Settings" → SettingsTab (company info edit pattern)
└── Persistent bottom section: biometric lock overlay (C7)
```

## Key Constants & Types

- `LOG_SECTIONS`: `[{ id: "logs", label: "Logs" }, { id: "profile", label: "Profile" }] as const`
- `LogSection` type: `(typeof LOG_SECTIONS)[number]["id"]`
- `TAB_MIN_WIDTH`: `96` (minimum pixel width for tab calculation)

## Edit-Button Pattern (Reusable)

Used in both `ProfileEntriesTab` and `AdminSettings` (website):

1. Content displays **read-only** by default
2. User taps **"Edit"** → form/inputs become active
3. User taps **"Save"** → changes are persisted, content locks
4. User taps **"Cancel"** → form closes, content returns to read-only (no changes)

This pattern ensures consistency across the app: users always know how to enter edit mode and lock changes.
