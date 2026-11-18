# Device & Control Roadmap — owner request (2026-11-19)

**Scope (explicitly limited by the owner):**

| Project         | Repo                     |
| --------------- | ------------------------ |
| App             | `genumsolutions-app`     |
| Website         | `genumsolutions-website` |
| 4WD4M car       | `Genum_4WD4M_CAR`        |
| 2WD1M car (new) | `Genum_2WD1M_CAR_NEW`    |

Nothing outside these four. No other car repos, no other pages.

**Rules for this work (owner):**

1. Document every requirement here, and keep the task list current **from this session onward**.
2. Push properly after each working phase.
3. Check for errors in the middle of the work, so breakage never accumulates.
4. Do not miss a single small item from the owner's message.

---

## 1. Requirements register

Every line below is a commitment. Status values: `TODO` / `IN PROGRESS` / `DONE` / `BLOCKED`.

### A. Remote controller screen (app)

| #   | Requirement (owner words)                                                                                           | Status |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | "the D-pad of the remote screen is not showing when the car is once connected"                                      | DONE   |
| A2  | "the tabs in the remote screen like connectivity, joystick are not proper and highlights when not needed"           | DONE   |
| A3  | "the status message or the notification shifts and moves the screens at bottom, please make that not move or shift" | DONE   |
| A4  | "that space is too much for the notification to show, please manage the remote screen window properly"              | DONE   |
| A5  | "inspect the control panel section totally and make all proper and standard"                                        | DONE   |

### B. Website control parity

| #   | Requirement                                                                                                                         | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1  | "the website controls should be different for the 2wd1m mode"                                                                       | TODO   |
| B2  | "add and integrate those for the website of the 2wd1m car too… make it like the app has for the 2wd1m mode controls and operations" | TODO   |
| B3  | "mind the controls for the landscape mode too for the mobile phone"                                                                 | TODO   |
| B4  | "if it doesn't take much space, design the car website like the app's 2wd1m mode and 4wd4m mode d-pads only"                        | TODO   |

### C. 2WD1M car behaviour

| #   | Requirement                                                                | Status |
| --- | -------------------------------------------------------------------------- | ------ |
| C1  | "the 2wd1m car is not remembering the last saved steering angles and trim" | TODO   |
| C2  | "(also the trim seems not to be working too)"                              | TODO   |
| C3  | "and the telemetries" (not remembered)                                     | TODO   |
| C4  | "the 2wd1m car is not changing to other external router"                   | TODO   |

### D. App data organisation

| #   | Requirement                                                                                                         | Status |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| D1  | "the app should act as per the cars used and sort the telemetries and datas as per the different projects and cars" | TODO   |
| D2  | "keep them arranged and properly synced for the remote screens and all its things properly"                         | TODO   |

### E. 4WD4M car

| #   | Requirement                                                                                           | Status |
| --- | ----------------------------------------------------------------------------------------------------- | ------ |
| E1  | "the 4wd4m car was resetting and freezing at the start of some cycle, please check and fix those too" | TODO   |

### F. Database

| #   | Requirement                                                                                                 | Status |
| --- | ----------------------------------------------------------------------------------------------------------- | ------ |
| F1  | "the database might have logged some datas about the device test too, so do so and resolve them if you can" | TODO   |
| F2  | "make the mechanism so that the things get resolved through the ci cd"                                      | TODO   |

### G. Admin dashboard

| #   | Requirement                                                                                                                    | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| G1  | "the user tab of the admin dashboard is quite confusing and duplicating the things"                                            | TODO   |
| G2  | "each car should be treated as a unique device"                                                                                | TODO   |
| G3  | "all the projects have a specific name like 4wd4mcar or 2wd1m car which is standard and should be hardcoded in their own code" | TODO   |
| G4  | "the app should treat them unique and organised"                                                                               | TODO   |
| G5  | "the user preference should display only its user log about the different car properly"                                        | TODO   |
| G6  | "so as that later the admin can see such for each user properly in the admin panel user tabs"                                  | TODO   |
| G7  | "have the tabs of subtabs for the user to see and use things properly"                                                         | TODO   |
| G8  | "the cars should be uniquely identified and organized and standard in the viewing"                                             | TODO   |

---

## 2. Root causes found while reading the code

### A1 — D-pad disappears on connect (confirmed)

`mobile/src/screens/RemoteControlScreen.tsx` (before this session):

```ts
const savedJoystickLayout = hub.savedPrefs?.joystickLayout; // "dual"
useEffect(() => {
  if (savedJoystickLayout) selectJoystickLayout(savedJoystickLayout);
}, [connected, wifiConnected, savedJoystickLayout, selectJoystickLayout]);
```

`useControlHub.selectJoystickLayout(id)` does `setUseJoystickState(id === "dual")`, and
`DevicePrefs` defaults `joystickLayout: "dual"`.

So **every time the car connects**, the effect re-applies `"dual"` → `useJoystick = true` →
`DriveControls` renders the **joystick**, and the D-pad vanishes. It also persists
`useJoystick: true` into the device profile, so the next connect reproduces it.

The layout vocabulary is also self-contradictory: default `joystickLayout: "dual"` with
`useJoystick: false`.

### A2 — tabs can highlight in impossible combinations

The strip is driven by three booleans (`showJoystick`, `showRouter`, `useJoystick`) with
overlapping predicates:

- D-pad : `showJoystick && !useJoystick`
- Joystick : `showJoystick && useJoystick`
- Telemetry : `!showJoystick && !showRouter`
- Connectivity: `showRouter`

Meanwhile the deck renderer disagrees with the strip: it uses
`showRouter || activeMode.id === "website-server"`, so the Connectivity panel can be mounted
while no pill is highlighted.

### A3/A4 — the status message eats deck height

`RemoteControlScreen.tsx` renders `InlineMessage` **in the flex column, after the deck**:

```tsx
{
  hub.connectionMessage || hub.carSilent ? (
    <View className="mt-1 flex-shrink-0 w-full items-center"> … </View>
  ) : null;
}
```

The deck is `min-h-0 flex-1`, so every time a message appears or disappears the deck shrinks or
grows — the reported "moves the screens at bottom". The block also has no height cap.

---

## 3. Plan (phases, in execution order)

1. **Phase 1 — Remote screen correctness** (A1–A5). Single view-state enum, D-pad default,
   notification as a zero-flow overlay, Control Panel audit.
2. **Phase 2 — Website control parity** (B1–B4). Shared d-pad zone spec, D-pad primary for both
   car modes, joystick demoted to a toggle, landscape check.
3. **Phase 3 — 2WD1M persistence + router** (C1–C4, D1–D2). One `profile_key` per physical unit,
   write-through prefs, on-connect reconcile, telemetry per device.
4. **Phase 4 — 4WD4M reset/freeze** (E1). Firmware worktree, reset-reason telemetry, CI compile gate.
5. **Phase 5 — Identity & naming** (G2–G4, G8). Canonical `4wd4mcar` / `2wd1mcar` constants.
6. **Phase 6 — Admin Users tab** (G1, G5, G6).
7. **Phase 7 — User preferences sub-tabs** (G7, G5).
8. **Phase 8 — DB residue + CI** (F1, F2). Extend `cleanup-test-residue.mjs`, add a `db-hygiene` job.

---

## 4. Session log

### 2026-11-19 — Phase 1 shipped (A1–A5)

**A1 — D-pad returns on connect.**

- `useControlHub`: new `normalizeJoystickLayout()` + `JoystickLayoutId` (`"dpad" | "joystick"`).
  `"dual"` is kept only as a legacy read alias for `"joystick"`.
- `selectJoystickLayout()` and `setUseJoystick()` now write `useJoystick` **and** `joystickLayout`
  together, so the two can never disagree.
- `DevicePrefs` default layout is `"dpad"` (was `"dual"`, which meant joystick).
- `carProfileService.isDefaultPrefs()` recognises `"dpad"`/null as the default, not `"dual"`.
- `RemoteControlScreen`: the connect-time `selectJoystickLayout(saved)` effect is **removed**;
  the surface is derived (`viewOverride ?? savedUseJoystick ? joystick : dpad`), so connecting
  can no longer flip the deck to joysticks.

**A2 — one view owns the tabs.**

- New `RemoteView = "dpad" | "joystick" | "telemetry" | "connectivity"`.
- The four pills render from a single table with `accessibilityState.selected` from `view`;
  the deck renderer switches on the same value (`view === "connectivity"` replaced the old
  `showRouter || activeMode.id === "website-server"` side-channel).
- `DriveControls` receives `useJoystick={view === "joystick"}`.
- Pills now carry `testID="remote-tab-{view}"` so the layout tests can assert selection.

**A3/A4 — the status note no longer moves the deck.**

- The `InlineMessage` strip moved out of the flex column into a zero-flow overlay:
  `absolute bottom-2 left-0 right-0`, `pointerEvents="none"`, `max-w-[460px]`,
  `testID="remote-status-overlay"`. Deck height is now constant whether a message is
  showing or not.

**A5 — Control Panel audit.**

- `ToolsScreen` mounts **no** connection UI (`ConnectionSection`/`WifiPanel` are not imported);
  its header comment and render agree that connections live only in the Remote's Connectivity
  tab. Confirmed single owner per concern: Remote = live control + connectivity;
  Control Panel = device/car profile card + project info. No duplicate surface left to remove.

**Verification:** `tsc --noEmit` clean, `eslint` clean, `prettier` clean, web export rebuilt,
full app Playwright suite **14/14 passed**.

### 2026-11-19 — session start

- Read `RemoteControlScreen.tsx`, `DriveControls.tsx`, `useControlHub.ts`, `carProfileService.ts`,
  `deviceProfileRegistryService.ts`, `RoboCarControl.tsx`, `AdminUsers.tsx`, `schema.sql`,
  `scripts/cleanup-test-residue.mjs`.
- Confirmed the A1 and A3 root causes (above).
- Noted: local `Genum_4WD4M_CAR` / `Genum_2WD1M_CAR_NEW` worktrees are empty (`.git` only) —
  firmware phases need a checkout first.
- Scope fixed to the four projects listed at the top.
