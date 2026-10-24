# storyboard — the app's REMOTE screen

> Owner (2026-10-24): _"make the note of all the thing of the story board of the
> remote screen … remove duplicates and residues and unnecessary things from all
> those section and utilize the line below the back button and the right side
> space of the back buttons and be precise and discrete about all the thing
> after the remote screens."_
>
> This is that note: the source of truth for **which region owns which fact, in
> what order**, and what may never come back to it. It follows the fleet
> convention (`Genum_4WD4M_CAR/storyboard.md` is the OLED twin): the shape is
> recorded here first, the code renders it, the tests pin it.
>
> Read with: `mobile/src/screens/RemoteControlScreen.tsx` (the render) and the
> pins — `remoteChrome.test.ts` · `phoneNetwork.test.ts` ·
> `connection/connectivityResponsiveness.test.ts`.

---

## Regions, top to bottom

### 1 · Chrome row — the row the Back button sits on

| Slot            | Content                                                                  | Rule                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| far left        | **Back** pill (`handleBack`)                                             | the only way out; never shares its slot                                                                                                                                                                                                                               |
| right of Back   | **the ONE broadcast-IP chip** — `deck-link-status`                       | renders ONLY while `pageLinkReady` (a live link **and** the car reports it is serving its own page). Body = the IP ALONE: no transport label, no car network name, no device name. Tap opens the car's page (`telemetry.ip`, else `DEFAULT_AP_IP` on its own hotspot) |
| spacer          | `flex-1`                                                                 | pushes the controls right — this is the **right-of-Back space** the owner asked to be used                                                                                                                                                                            |
| right (robocar) | **ModeChooser** · **`Spd` ValueStrip** · **Settings gear** (`h-14 w-14`) | mode + speed are the top-strip controls in every mode (R-20); the gear opens region 5                                                                                                                                                                                 |

### 2 · Merged row — the line BELOW Back (`h-9`, constant)

This is the **line below the back button**. Order = the Q2 overflow priority
(first to drop on a narrow phone, never the controls):

1. **phone's own network chip** — `remote-phone-network`. Truncates
   (`max-w-[200px]`), never hides.
2. **Bluetooth disconnect** — `remote-disconnect-bt`.
3. **Wi-Fi disconnect (hotspot variant)** — `remote-disconnect-wifi`, while the
   car is on its own AP.
4. **Wi-Fi disconnect (router variant)** — `remote-disconnect-wifi`, while the
   car is on a router. 3 and 4 are ONE chip in two states; they never render
   together.
5. **Compact telemetry line** — the **only** width-gated element in the row
   (`width >= MERGED_ROW_TELEMETRY_MIN_PX`). Dropping it is what keeps the
   controls on screen; the same readings exist on the Telemetry tab.
6. spacer → **pills on the right**: **D-pad · Joystick · Telemetry ·
   Connectivity** (`px-4 py-2`, 12 px bold — the "too small to click" fix).

Hard rules: the row **never grows** (it is `h-9`; if something stops fitting,
telemetry drops first) · every disconnect chip = transport icon + name + ✕ and
tears down **only its own transport** · `handleDisconnect()` (both links) is not
reachable from this screen.

### 3 · Message strips (exactly one of each)

- `hub.connectionMessage` → one `InlineMessage`, auto-clears on the hub's 4 s
  timer (there used to be 14 call sites and no renderer).
- `hub.carSilent` → the freeze strip: _"The car has not answered for a while —
  it may have frozen…"_ (U-121 D: a live link says nothing about a live car).

### 4 · Content area — the deck (`flex-1 min-h-0`, bounded)

The pills choose **one** panel; the deck owns its ONE card (no nested card —
U-58's overlap fix):

| Pill             | Robocar panel                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-pad / Joystick | `DriveControls` (`showJoystick`; `useJoystick` picks the pad)                                                                                                                                           |
| Telemetry        | `DriveTelemetry` + the mode readout (`pid-auto` → `BalanceControls` instead)                                                                                                                            |
| Connectivity     | `ConnectionSection` (the ONE connection surface) inside `KeyboardAvoidingView` + `ScrollView`; `onInputFocus` scrolls the focused field clear of the keyboard. Also the panel for `website-server` mode |

Non-robocar: the category deck (SmartFarm / SmartCity / SmartDustbin /
Handheld / SmartHome) or `DroneControls`; no deck → `SensorGrid`.

### 5 · Settings dropdown (gear)

Absolute panel on the right (`right-3`, `z-40`) over a dismissible scrim
(`z-30`). Car toggles: **Wi-Fi · Bluetooth · Webpage** (never both transports
off) + the app's smart-link auto-join. The **car's boot auto-join toggle is
removed** (P3/Q1 — the firmware no longer hops at power-up).

### 6 · Reconnect prompt

`renderLinkPrompt()` is the **last expression in the render** — it sits above
everything else. ONE card, Reconnect + Cancel, and it **names the method**
(Bluetooth/Wi-Fi). The restart _record_ is not here (U-118); it leads Tools →
Diagnostics.

---

## The single-copy map — where a fact lives, and where it must NOT

| Fact                                              | Its ONE home                              | Must not appear in                                              |
| ------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| the phone's own network                           | merged row `remote-phone-network`         | the Connectivity panel — the _"This phone"_ box is deleted (A2) |
| link status / the car's address                   | chrome row IP chip                        | a status bar inside the Connectivity panel (U-108 removed it)   |
| disconnect a transport                            | merged row chips                          | the method cards, the chrome row                                |
| what the car knows (paired cars / added networks) | Connectivity **left-bottom**, read-only   | —                                                               |
| switch / add / edit / forget a network            | Connectivity **right pane** (the manager) | the left inventory — its rows carry no switch action (C2)       |
| the car's Wi-Fi network + the control address     | **Car network** card (auto-filled)        | the chrome chip (broadcast IP only)                             |
| the restart record                                | Tools → Diagnostics                       | the Remote deck (U-118)                                         |
| nearby scan rows                                  | right pane, only after an explicit Search | anywhere unprompted (M1)                                        |

## Residues removed — do not re-add

- the **"This phone"** box and `ConnectionSection`'s `formatPhoneNetwork`
  re-export (A2, owner _"remove this box as the whole"_).
- the **"Other ESP / IoT projects"** card (`IotEntryCard`, `conn-iot-entry`) —
  component deleted in A1, its usage deleted in A2 (that dangling usage is what
  left `tsc` red with `TS2304` on resume).
- the **second copy of the merged-row header comment** plus its stray `{" "}`
  (A2), and the stale `{" "}` after `TargetBody`'s BT block (C2).
- the **duplicate tap-to-switch** rows on the left inventory (C2): two lists of
  the same routers, two identical sets of buttons.
- comments that promised removed features (the IoT entry in the right-pane
  header; the "list hides once BLUETOOTH is up" note that contradicted M1).

## Pins that keep this storyboard honest

| Storyboard claim                                           | Pinned by                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| one IP chip right of Back, gated on the page               | `remoteChrome.test.ts` "issue 10" / "the chip renders ONLY behind a live link…"                                             |
| the merged row's order, sizes and the single width gate    | `remoteChrome.test.ts` "issue 5+6", "the compact telemetry line is the ONLY width-gated thing…"                             |
| each chip tears down only itself (3 render sites, 2 chips) | `remoteChrome.test.ts` "issue 3"                                                                                            |
| the phone's network renders exactly once                   | `phoneNetwork.test.ts` (panel asserts ABSENT), `remoteChrome.test.ts` "the phone's own network chip lives on the FIRST bar" |
| the connection surface is one panel with one manager       | `connectivityResponsiveness.test.ts` (car-network card, B2 ×2, C2 ×3), `pairedList.test.ts`, `dualLinkConnect.test.ts`      |

_F-61: every line above is source- and test-level truth. A device pass is what
makes it observed truth — rows live in `mobile/TESTING.md`._
