# GENUM Solutions — Native Type Scale & Spacing Rhythm

**Canonical reference for v1.5.8 "whole-app type scale".** Read before styling any
text in the app. Updated 2026-09-03 (Phase B — scale defined, fonts embedded).

---

## Why this file exists

The app previously rendered every text element in the **platform default font**
(Roboto on Android): `font-display` (`Sora`) and `font-sans` (`Inter`) were named in
`tailwind.config.js` but **no font files were bundled**, so headings, body, and
labels all looked identical — a "uniform" wall of text with no hierarchy.

Phase B fixes the foundation:
1. **Fonts are now embedded natively** via the `expo-font` config plugin in
   `app.json` (`Inter` 400/500/600/700/900 + `Sora` 400/600/700). On Android the
   plugin writes per-weight XML font definitions, so `fontFamily: 'Inter'` +
   `fontWeight: '700'` (what NativeWind emits for `font-sans font-bold`) resolves to
   the correct embedded weight. **This takes effect in the next native rebuild**
   (regenerate `android/` with `npx expo prebuild -p android` before `gradlew
   assembleRelease`).
2. **This document fixes the role → utility mapping** so every screen picks the same
   size/family/weight/tracking for the same role.

Rules of thumb:
- Headings and headline numbers → **Sora** (`font-display`).
- Everything else (body, UI labels, buttons, inputs) → **Inter** (`font-sans`).
- A text without any family class keeps the platform default font. When you add a
  new body/UI text that should follow the brand, add `font-sans` (see roles below).
- Colors stay contextual — a role class never hardcodes a color. Kicker text is
  `text-navy` on light surfaces, `text-gold`/`text-white` on navy.

---

## Text roles

| Role | Utilities | Use for |
|---|---|---|
| **Kicker / eyebrow** (page + section level) | `text-xs font-black uppercase tracking-[0.24em]` | The small over-line above a hero/section (e.g. "What GENUM does"). Gold on navy, navy on light. |
| **Hero / page title** (1 per screen) | `font-display text-3xl font-bold leading-tight` (+`tracking-tight` optional) | Home hero, Journal/Legal/Printing/OpenTools page heroes. |
| **Section heading** | `font-display text-2xl font-bold tracking-tight` | Statement headings inside content (pilot-cost total, "A useful loop…"). |
| **Card / sub heading** | `font-display text-xl font-bold tracking-tight` | Training-program cards, CTA panel titles, admin dashboard headings. |
| **Dense / small display heading** | `font-display text-lg font-bold` | Website-mirrored panel headings, price figures, brand wordmark "GENUM". |
| **Item title (lists, sans)** | `font-sans text-base font-bold leading-snug` | Service rows, cart line names, list item names. Grid product names may stay `text-[13px]` (2-up cards). |
| **Body paragraph** | `font-sans text-sm leading-6 text-muted` | Descriptions under titles. Ink instead of muted for primary copy. |
| **Compact body** | `text-sm leading-5` | Dense card copy (services list, journal excerpts). |
| **Meta / caption** | `font-sans text-xs text-muted` | Dates, emails, secondary rows, app-version line. |
| **Strong meta / status** | `text-xs font-bold` (+`text-navy`/`emerald`/`red`/`gold` per meaning) | Status labels, prices-in-context, "View all" style links at `text-sm`. |
| **Micro label (dense UI)** | `text-[10px]` | Chart axis dates, tiny overlay labels. Keep `tracking-widest` for inline micro-labels inside admin/tools cards (matches website admin). |
| **Button label** | `text-sm font-bold` (solid emphasis `text-sm font-black`) | Pressable labels; input/field labels above fields `text-sm font-bold text-ink`. |

> **Kicker tracking:** 0.24em is the app-wide kicker standard (mirrors website
> `.24em` page eyebrows). `tracking-widest` remains only for **inline micro-labels**
> inside dense cards (admin stats, mode info, category chips). Prefer 0.24em for
> anything that reads as a section over-line; if a long 0.24em kicker risks
> wrapping in a half-width card at max font scale, use `tracking-widest` instead.

## Spacing rhythm

- Screen content padding: horizontal `px-5`, bottom `paddingBottom` ≥ 24–32.
- Section stack: `pt-6` between content blocks; cards `mb-2`–`mb-3` or `gap-3`/`space-y-3`.
- Cards: `p-4`; rounded `rounded-xl`–`rounded-2xl`; borders `border-line`.
- Between kicker/title and body inside a hero/section: `mt-1`–`mt-3` (kicker → title
  `mt-1`/`mt-2`; title → body `mt-2`/`mt-3`).
- Rows inside cards: `py-2`–`py-3` with `border-b border-line` separators.
- Buttons: height from `py-2.5`–`py-3` + `px-4`–`px-5` (never fixed heights that
  clip at max font scale).

## Acceptance (per roadmap)

- Clear visual hierarchy on every screen (display headings → sans body → xs meta).
- Nothing overflows, clips, or is blocked at max system font sizes — no fixed-height
  text containers; multi-line text uses wrapping rows, not `numberOfLines` where
  content may be long.
- Existing patterns preserved: semantic color tokens (`ink/navy/muted/gold/…`) and
  NativeWind utility classes stay the mechanism — no new styling library.

## Phase map (v1.5.8)

- **Phase B (done 2026-09-03):** fonts embedded (`app.json` expo-font plugin);
  this doc written; scale applied to BrandHeader, Home hero/services, Account,
  Admin dashboard headings.
- **Phase C:** roll the roles above across every remaining screen — normalize
  kickers to 0.24em, promote section titles to the right display role, add
  `font-sans` to body text that should be Inter, and spot-check long strings at
  max font scale (device window).
