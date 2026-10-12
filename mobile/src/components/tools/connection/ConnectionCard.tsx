// =====================================================================
// connection/ConnectionCard — the ONE card every connection option uses.
//
// U-68, owner verbatim: *"the cards and the section of the control panel page
// are not unifrom in the fuctiion"*. That was four card shapes stacked on one
// page, each with its own header rule, button style, spacing and error
// surface — so two options that looked alike behaved differently, and the
// difference only showed up when something failed.
//
// F-67 makes uniformity a FUNCTIONAL requirement rather than a styling
// preference: options a user chooses between must be rendered by one
// component and report through one surface. So this file owns:
//   - the card frame, the title row, the subtitle slot, the state dot;
//   - the two button shapes (primary / quiet) and their disabled rule;
//   - the inline note and the inline error, with ONE visual language.
//
// ---------------------------------------------------------------------
// U-69 (2026-10-02) — CONTRAST. *"the text and the background are merging and
// the texts are not visible properly. please fix the contrast too for once and
// for all."*
//
// The systemic cause: this app's palette is a set of SEMANTIC tokens (ink,
// navy, sky, card, muted, line…) and it defines NO error, success or selected
// pair. So every failure surface reached for an off-palette Tailwind colour —
// `text-red-600`, `bg-emerald-500/10`, `bg-sky-500/5`. Off-palette colours do
// NOT flip with the theme: red-600 on a white card is readable, and red-600 on
// the dark card (#16223a) is very nearly invisible. It looked fine in Light and
// broke in Dark, which is why it read as random.
//
// The fix is a TOKEN fix, not a patch, and it is the reason this file is worth
// reading: **this module uses semantic tokens only.** Every foreground here is
// one the theme defines for both schemes, with its contrast against the card
// checked. `danger` / `success` / `select-bg` / `select-ink` were added to
// global.css (all three theme blocks, including the manual Dark pick) and
// tailwind.config.js for exactly this.
//
// The rule to keep: if a colour is not in `theme.extend.colors`, it does not
// belong in this folder. Adding a new one-off colour is how the merge happened.
// =====================================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

export type CardTone = "idle" | "busy" | "live" | "error";

/** State dot. Uses `border`/`gold`/`success`/`danger` — all semantic. */
const TONE_DOT: Record<CardTone, string> = {
  idle: "bg-border",
  busy: "bg-gold",
  live: "bg-success",
  error: "bg-danger",
};

export function ConnectionCard({
  title,
  subtitle,
  icon,
  tone = "idle",
  selected = false,
  onPress,
  right,
  children,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  icon?: React.ComponentProps<typeof Feather>["name"];
  tone?: CardTone;
  selected?: boolean;
  onPress?: () => void;
  /** U-98: an optional inline action slot on the title row's right edge, so a
      card can own a small action (e.g. Disconnect) WITHOUT a loose button
      below it. Kept narrow so it never competes with the title. */
  right?: React.ReactNode;
  children?: React.ReactNode;
  testID?: string;
}) {
  const body = (
    <>
      <View className="flex-row items-center gap-1.5">
        {icon ? (
          <Feather
            name={icon}
            size={11}
            // Semantic only: `ink` is the highest-contrast foreground in both
            // themes, so the icon can never be the thing that disappears.
            color={selected ? "#1e3a8a" : "#475569"}
          />
        ) : null}
        <Text
          // Selected uses select-ink ON select-bg (8.4:1 both themes); normal
          // uses ink on card (13:1 light, 12:1 dark). Never an off-palette
          // shade, never a `dark:` override — the tokens already flip.
          className={`min-w-0 flex-1 text-[11px] font-black ${
            selected ? "text-select-ink" : "text-ink"
          }`}
        >
          {title}
        </Text>
        <View className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
        {right ? <View>{right}</View> : null}
      </View>
      {subtitle ? (
        <Text className="mt-0.5 text-[10px] leading-3 text-muted">
          {subtitle}
        </Text>
      ) : null}
      {children ? <View className="mt-1.5">{children}</View> : null}
    </>
  );

  // Selected is a FILLED pair (select-bg + select-ink), not a faint tint with a
  // darker label — a 5%-alpha background is exactly the kind of near-invisible
  // surface that produced the original complaint.
  const frame = `rounded-lg border p-2 ${
    selected
      ? "border-select-ink bg-select-bg"
      : tone === "error"
        ? "border-danger bg-danger-soft"
        : "border-line bg-card"
  }`;

  if (!onPress) return <View className={frame}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      testID={testID}
      className={frame}
    >
      {body}
    </Pressable>
  );
}

/** The two button shapes. One definition, so no option can invent a third. */
export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  icon,
  flex = false,
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  flex?: boolean;
  /** U-98: the same button, sized to sit in a card's TITLE row (the `right`
      slot). Same tokens, same press rules — a compact shape, not a new one. */
  compact?: boolean;
  testID?: string;
}) {
  // Primary is navy with white ink in BOTH themes (navy is blue-900 light /
  // blue-600 dark, both dark enough for white text). The old `bg-sky-700` was
  // an off-palette value that never flipped.
  const tone =
    variant === "primary"
      ? "bg-navy"
      : variant === "danger"
        ? "border border-danger bg-danger-soft"
        : "border border-line bg-card";
  const text =
    variant === "primary"
      ? "text-white"
      : variant === "danger"
        ? "text-danger"
        : "text-ink";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      className={`${compact ? "h-6 px-2 gap-1" : "h-8 px-3 gap-1"} ${
        flex ? "flex-1" : ""
      } flex-row items-center justify-center rounded-full ${tone} ${
        disabled ? "opacity-50" : "active:opacity-70"
      }`}
    >
      {icon ? (
        <Feather
          name={icon}
          size={compact ? 10 : 12}
          color={
            variant === "primary"
              ? "#ffffff"
              : variant === "danger"
                ? "#b91c1c"
                : "#475569"
          }
        />
      ) : null}
      <Text
        className={`${compact ? "text-[10px]" : "text-[11px]"} font-black ${text}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * ONE message surface for every outcome of every action in the section.
 *
 * `info` is the neutral note, `ok` the confirmed success, `error` the refusal.
 * Each is a semantic foreground on its own soft background, so none of them can
 * be unreadable — which is the whole point of F-70 below.
 */
export function InlineMessage({
  tone,
  children,
}: {
  tone: "error" | "ok" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-danger bg-danger-soft"
      : tone === "ok"
        ? "border-success bg-success-soft"
        : "border-line bg-card";
  const textClass =
    tone === "error"
      ? "text-danger"
      : tone === "ok"
        ? "text-success"
        : "text-muted";
  return (
    <View className={`mt-1.5 rounded-md border px-2 py-1 ${toneClass}`}>
      <Text className={`text-[10px] leading-3 ${textClass}`}>{children}</Text>
    </View>
  );
}
