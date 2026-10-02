# SESSION — 2026-10-02 (app + 4WD4M: connections, control panel, integration)

> One-day arc: bench feedback → fixes → deeper feedback → fixes → integration audit.
> Everything JS-only (OTA 3.2.7/60) except the car repo, which stays UNFLASHED until the
> owner flashes `main`. Full per-round detail: `TRACKS/NEXT-SESSION.md` (app) +
> `TRACKS/NEXT-SESSION.md` (car repo). This file is the one-page record of what we did.

## Rounds shipped (commit → what it was)

| Round | Commits (app) | What |
|---|---|---|
| **U-63** | `0b73887` + ledgers | **OPS-3:** a BT connect is named by the row the user just tapped — a stale screen-level scan row (survives a method switch un-cleared) could relabel the car with a MAC fallback name. Pure `resolveBtConnectDevice`; F-40's never-refuse fallback pinned. |
| **U-64** | diagnostics removal · `02548b2` · `1ccf24d` | **Owner evening feedback:** ① Control Panel simplified (details/disclosures, noise lines cut) · ② the home-router handoff now ASKS (Yes/Cancel; inline add; new `car-dropped` phase) · ③ WifiDiagnosticsPanel deleted. |
| **U-65** | `ce6a507` · `6e01c37` · `1a0b6be` | **④b:** chosen-link routing tie-break when two links are live (`commandRouting.ts`, 11 tests) — a stale BT link can no longer strand drive commands · **F-46** regression finally pinned (non-brittle) · **⑤** post-connect chrome collapse animated. |
| **U-66** | `dad5c0c` · `eb7d436` · `ba3cf36` | **The integration bug behind ④** (see below) · auto-join toast labelled automatic + off-switch named · **OTA Guard** workflow. |

Gates at close: tsc **0** · vitest **457/457** (32 files) · prettier clean. All pushes CI-green;
every JS push OTA-published (3.2.7/60 unchanged — no APK).

## The integration findings (app ↔ 4WD4M)

1. **The car-reset report was firmware, not the app.** `ROUTERS;USE` on an unknown router
   reboots the flashed binary — fixed on `Genum_4WD4M_CAR` `main` (`cd3158f`) but NOT on the
   board. Flash `main` before the bench rounds; until then the home-router switch cannot pass.
2. **④'s dull STA deck had a second, app-side root cause (U-66).** The car's JSON `ip` is
   never empty — on its own AP it reports the softAP gateway (192.168.245.1, R-13) — and
   `"connected"` means ANY transport up. With a router stored, the handoff read "ready" and
   offered the car's own hotspot as the "home router" dial: phone never left the AP, banner
   said verified, deck starved. Fix app-side: `ready` requires a non-gateway IP;
   `staDialUrl` refuses the gateway outright. (Firmware behaviour is correct and load-bearing.)
3. **Smart-link auto-join kept, no confirm** — it IS the owner's 2026-09-30 decision
   (toggle per car, once per session, own-AP-only). Toast now says it is automatic and names
   the off-switch. On the old binary this auto-fire was the likely "reset during connect".
4. **Remote window audited — clean.** Same hub hook, so the routing fix applies there
   automatically; zero direct service sends; disconnect safe-stops are direct by design.

## New process rules shipped

- **`ota-guard.yml`** — a JS push to main goes RED unless the latest published bundle's
  commit is an ancestor of the pushed tip. Closes the F-1/F-2 delivery hole CI never gated.
- **Rule candidate recorded (F-59 family):** a prompt that describes an action must BE the
  confirm for that action — never narrate a command that already went out (applies to
  automation too: label automatic actions as automatic).

## Queued for the owner (nothing code-blocked)

1. **Flash `Genum_4WD4M_CAR` `main`** (T21–T23 rows) — the whole home-router flow depends on it.
2. **⭐ BENCH MASTER RUN** (top of `mobile/TESTING.md`): Stage 0 flash sanity → Stage 1 car
   rows → Stage 2 app rounds U-61 → U-63 → U-62/U-64 → U-65 → U-66, with result-reading rules.
3. **④a/④c discrimination** — if U-65-1 driving passes but tiles stay empty over a verified
   STA link, capture banner + OLED row (that would be no-STATE-over-STA, firmware side).
4. Open decisions: MQTT broker/credentials · Phase C unlock order (HTTP→BLE→mDNS→MQTT).
