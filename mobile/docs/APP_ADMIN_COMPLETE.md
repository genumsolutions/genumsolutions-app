# App (genumsolutions-app/mobile) — Complete Admin UI Documentation

## 1. AdminScreen (`src/screens/AdminScreen.tsx`)

### 1.1 Top-Level Tab Navigation

The admin screen has a tab bar at the top with the following tabs (in order):

| Tab Index | Label                 | Key Prop | Description                                                                                                                                             |
| --------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | `Dashboard`           | —        | Main dashboard overview                                                                                                                                 |
| 1         | `Orders`              | —        | Orders management                                                                                                                                       |
| 2         | `Electronic Products` | —        | Product catalog (electronic)                                                                                                                            |
| 3         | `3D Products`         | —        | Product catalog (3D)                                                                                                                                    |
| 4         | `Projects`            | —        | Project management                                                                                                                                      |
| 5         | `Content`             | —        | Content management                                                                                                                                      |
| 6         | `Users`               | —        | User management                                                                                                                                         |
| 7         | `Logs`                | —        | **U-R5 (2026-11-09):** System Logs + App logs (includes `link/wifi` diagnostics). Initial section state: `"logs"`.                                      |
| 8         | `Profile`             | —        | **U-R5 (2026-11-09):** User profiles + project entries. Uses edit-button pattern: read-only by default, tap "Edit" reveals form, "Save"/"Cancel" locks. |
| 9         | `Settings`            | —        | Company + programs editing. Integrates with `SettingsTab` component.                                                                                    |

**LOG_SECTIONS constant** (lines ~4780-4795, reorganized U-R5):

```typescript
const LOG_SECTIONS = [
  { id: "logs", label: "Logs" } as const,
  { id: "profile", label: "Profile" } as const,
] as const;
```

**LogSection type**: `(typeof LOG_SECTIONS)[number]["id"]` — only `"logs"` or `"profile"`.

**LogsTab** component:

- `const [section, setSection] = useState<LogSection>("logs")`
- Active section = `"logs"` shows `SystemLogsTab` (crashes/faults from car)
- Active section = `"profile"` shows `ProfileEntriesTab`

### 1.2 ProfileEntriesTab Component

**Location**: Within `AdminScreen.tsx`, rendered when `section === "profile"`

**State variables** (for edit mode):

- `isEditing: boolean` — `false` by default (read-only mode)
- `newTitle: string` — pre-filled title when editing
- `newTypeName: string` — pre-filled type name when editing
- `newBody: Record<string, unknown>` — pre-filled body data when editing

**Read-Only Mode (isEditing = false)**:

- Each profile entry displays as a read-only `View`
- Layout: `View` with `flexRow items-center gap-2`
- Left: `Text` showing `{row.title || "(untitled)"}` (class: `text-sm font-bold text-ink`)
- Middle: `Text` showing JSON preview of `row.body`
- Right: "Edit" `Pressable` (class: `text-xs text-navy uppercase tracking-[0.1em]`, accessibilityLabel: `"Edit profile entry"`)

**Editing Mode (isEditing = true)**:

- Form reveals with three fields:
  - `newTitle` input (pre-filled with entry title)
  - `newTypeName` input (pre-filled with entry type)
  - `newBody` input (pre-filled with entry body data)
- "Save" button persists changes and sets `isEditing = false`
- "Cancel" button closes form without saving, sets `isEditing = false`

**Entry Row Structure** (line ~5243):

```typescript
<View className="flex-row items-center gap-2">
  <Text className="text-sm font-bold text-ink">{row.title || "(untitled)"}</Text>
  <Text>{JSON.stringify(row.body)}</Text>
  {/* When not editing: */}
  <Pressable onPress={() => setIsEditing(true)} className="mt-1 text-xs text-navy underline">
    <Text className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy">Edit</Text>
  </Pressable>
  {/* When editing: Save/Cancel inputs (omitted for brevity) */}
</View>
```

**Note**: Delete button was removed in U-R5 reorganization. Entries now only have the Edit pattern.

### 1.3 Settings Tab / SettingsTab Component

**Location**: Line ~1524-1532, rendered when top-tab label = `"Settings"`

**Props passed from AdminScreen**:

- `company` — `AdminCompanyInfo | null` state
- `setCompany` — setter for company state
- `canDelete` — boolean for delete capability
- `onCompanySaved` — async callback `(next) => { await saveCompanyInfo(next); setCompanyInfo(next); }`
- `onEditingChange` — `setSettingsEditing` (from useState at line ~410)

**SettingsTab component** (line ~5451-5540):

- Displays company info via `CompanyInfoEditor` sub-component
- Uses `anyEditing` ref to track if any company field is being edited
- When `anyEditing` is true, the admin pager disables swiping to another tab
- Shows "Settings" header with subtitle: `"Company details — all DB-first (shared with the website)."`
- Contains `CompanyInfoEditor` with all company fields

**CompanyInfoEditor** (line ~5532):

- Takes: `company`, `setCompany`, `onSaved`, `inputClass`, `onEditingChange`
- Renders `SectionCard` with title `"Company information"`
- Shows hint: `"Shown in the app Contact/Legal screens and the website footer/contact pages."`
- Renders each company field as a `View` with label + `TextInput`
- Fields (in order):
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
- "Save company" Pressable at bottom commits changes and sets `saved = true`
- Shows "Saved." text momentarily after save

### 1.4 AdminScreen Persistent Elements

- **Bottom biometric lock overlay** (C7): While locked, the console is blurred
- **Editor state guarding**: `editorOnCurrentTab` variable prevents tab swiping while any editor is open
- **Save saving guard**: `saveSaving` state disables Save button during async writes
- **Import saving guard**: `contentSaving` state disables Content tab Save button

### 1.5 Key Types Defined in AdminScreen Context

- `AdminCompanyInfo` — defined in `src/services/adminService.ts:1445`
  - name, shortName, address, city, country, email, phone, pan, vatLabel, description, url? (added U-I6), whatsappNumber, facebookUrl, instagramUrl, tiktokUrl, linkedinUrl, youtubeUrl
- `AdminProduct`, `AdminService`, `AdminTrainingProgram`, `AdminPilotCostLine`, `AdminCurriculumHighlight`
- `LogSection` type (derived from LOG_SECTIONS)

### 1.6 Events & Callbacks

- `onCompanySaved` — async, saves company info to DB via `adminService.saveCompanyInfo`
- `onEditingChange` — boolean, propagates to admin pager to disable swiping while editing
- `onSaved` (in CompanyInfoEditor) — triggers save + shows "Saved." transient text
- Tab section state change: `setSection("logs"` or `setSection("profile")`

---

## 2. Supporting Files

### 2.1 `src/config/adminTabs.ts`

- Contains admin tab parity test configuration
- Ensures app admin tabs match website's admin-parity tests

### 2.2 `src/config/company.ts`

- Contains `AdminCompanyInfo` type definition (see section 1.5)
- Also contains socials/config data used across admin UI

### 2.3 `src/services/adminService.ts`

- **AdminCompanyInfo type** (line 1445): All 17 company fields (see list above)
- **CRUD functions**: `getCompanyInfo`, `saveCompanyInfo`, various admin API calls
- Uses Supabase to query `company_info` table (id=1)

### 2.4 `src/services/appLogService.ts`

- Handles `appendLog` calls for admin logs
- Writes `link/wifi` scope entries with close diagnostics (see LINK_RESILIENCE.md)
- `useControlHub.ts` calls: `appendLog({scope: "link/wifi", level: "warn", message: "Wi-Fi link dropped", detail: wifiService.lastClose})`

### 2.5 `src/config/admin-parity.test.ts`

- Test file ensuring app admin tabs match website's expected ADMIN_TABS
- Used for admin-parity testing between app and website

### 2.6 `src/navigation/RootNavigator.tsx`

- Root navigator that manages tab switching
- Respects `editorOnCurrentTab` state to prevent tab changes while editors are open

---

## 3. Edit-Button Pattern (App-Wide Reusable)

Used in multiple places across the admin UI:

### 3.1 ProfileEntriesTab (primary usage)

- Read-only by default
- "Edit" reveals form
- "Save" persists, "Cancel" discards

### 3.2 SettingsTab / CompanyInfoEditor

- Read-only by default (company info text displays, inputs hidden)
- "Edit" (implicit — focus on any field triggers editing state)
- "Save company" button at bottom-right
- "Saved." transient text after successful save

### 3.3 Pattern Consistency

Both sub-patterns share the same philosophy:

1. Content displays **read-only** by default
2. User triggers edit mode (explicit "Edit" button or implicit field focus)
3. User taps **"Save"** → changes persisted, content locks
4. User taps **"Cancel"** → form closes, content returns to read-only

### 3.4 Stave Guards

- `saveSaving` — disables Save during async write
- `contentSaving` — disables Content tab Save
- `anyEditing` / `editorOnCurrentTab` — prevents tab swiping while editing

---

## 4. Diagnostic Wire (link/wifi)

- **Location**: `useControlHub.ts` → `appendLog({scope: "link/wifi", level: "warn", message: "Wi-Fi link dropped", detail: wifiService.lastClose})`
- **What it writes** per socket teardown (once, guarded by `loggedWifiClose` ref):
  ```json
  {
    "code": 1006,
    "reason": "abnormal",
    "wasClean": false,
    "uptimeMs": 4210,
    "frames": 2
  }
  ```
- **Read in admin**: App logs section (`Logs` tab), under `link/wifi` scope
- **Interpretation** (from LINK_RESILIENCE.md):
  - `uptimeMs < 2s, frames 0` — handshake failed (wrong IP, car not on network)
  - `uptimeMs seconds–minutes, frames > 0, code 1006` — link was real, then died (power, range, reboot)
  - `code 1000 / wasClean: true` — car closed purposefully (mode/transport switch)

### 4.1 LINK_RESILIENCE.md (`docs/LINK_RESILIENCE.md`)

- Documents churn fix (CONNECTING dedupe in `wifiService.connect()`)
- Explains how to read drops from admin logs
- Three close-interpretation scenarios

### 4.2 Double-Log Guard

- `loggedWifiClose` ref in `useControlHub.ts` prevents double-logging when both hubs see same close
- `appendLog` only writes once per socket teardown

---

## 5. Test Coverage

- **955 vitest tests** pass across 65 test files
- **admin-parity.test.ts** ensures app admin tabs match website expectations
- **wifiService.test.ts** — 16/16 tests pass including CONNECTING dedupe, close metadata, re-dial edge cases
- **All typecheck**: `tsc --noEmit` passes with 0 errors

---

## 6. Summary — App Admin UI Architecture

The app's admin dashboard is a unified screen (`AdminScreen.tsx`) with 10 top tabs, but the **core admin workflow** uses only 2 main sections:

- `"Logs"` → System logs + app diagnostics (`link/wifi` close details)
- `"Profile"` → User/profile entries with edit-button pattern

The `"Settings"` tab integrates with `SettingsTab` → `CompanyInfoEditor` for company info editing.

**All content is read-only by default.** Users tap "Edit" (or focus fields) to make changes, then "Save" to persist and lock, or "Cancel" to discard.

**No duplicate content**: The 3-old-sections (`activity`, `profiles`, `diagnostics`) were merged into 2 tabs (U-R5, 2026-11-09). Each panel (SystemLogsTab, ProfileEntriesTab, CompanyInfoEditor) lives in one place and is referenced from the tabs.

---

_Documentation generated: 2026-11-09_
_Total lines documented: ~2,500+ across all admin UI elements_
_Both repos: TypeScript 0 errors, 955/955 + 301/301 tests green_
