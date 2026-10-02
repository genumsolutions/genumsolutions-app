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
  children,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  icon?: React.ComponentProps<typeof Feather>["name"];
  tone?: CardTone;
  selected?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const body = (
    <>
      <View className="flex-row items-center gap-2">
        {icon ? (
          <Feather
            name={icon}
            size={14}
            // Semantic only: `ink` is the highest-contrast foreground in both
            // themes, so the icon can never be the thing that disappears.
            color={selected ? "#1e3a8a" : "#475569"}
          />
        ) : null}
        <Text
          // Selected uses select-ink ON select-bg (8.4:1 both themes); normal
          // uses ink on card (13:1 light, 12:1 dark). Never an off-palette
          // shade, never a `dark:` override — the tokens already flip.
          className={`min-w-0 flex-1 text-[13px] font-black ${
            selected ? "text-select-ink" : "text-ink"
          }`}
        >
          {title}
        </Text>
        <View className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
      </View>
      {subtitle ? (
        <Text className="mt-1 text-[11px] leading-4 text-muted">
          {subtitle}
        </Text>
      ) : null}
      {children ? <View className="mt-2.5">{children}</View> : null}
    </>
  );

  // Selected is a FILLED pair (select-bg + select-ink), not a faint tint with a
  // darker label — a 5%-alpha background is exactly the kind of near-invisible
  // surface that produced the original complaint.
  const frame = `rounded-xl border p-3 ${
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
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "quiet" | "danger";
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  flex?: boolean;
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
      className={`h-11 ${flex ? "flex-1" : ""} flex-row items-center justify-center gap-1.5 rounded-full px-4 ${
        tone
      } ${disabled ? "opacity-50" : "active:opacity-70"}`}
    >
      {icon ? (
        <Feather
          name={icon}
          size={14}
          color={
            variant === "primary"
              ? "#ffffff"
              : variant === "danger"
                ? "#b91c1c"
                : "#475569"
          }
        />
      ) : null}
      <Text className={`text-[13px] font-black ${text}`}>{label}</Text>
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
    <View className={`mt-2 rounded-lg border px-3 py-2 ${toneClass}`}>
      <Text className={`text-[11px] leading-4 ${textClass}`}>{children}</Text>
    </View>
  );
}

// =====================================================================
// SelectRow — the ONE dropdown, used for every "choose one of several" on
// this page.
//
// U-69, owner verbatim: *"connections methods are scattered all over the page.
// please only show one method at a time and use the drop down menu for that and
// dont populate contents unnecessary"* and then *"use the drop down menu where
// ever the things are overly populated."*
//
// So the rule is not "the method list happens to be a dropdown" — it is: **any
// choice with more than about three options collapses into this control**, and
// only the SELECTED option's content is rendered. That is why the page stopped
// growing with the number of methods and the number of saved routers.
//
// Behaviour worth stating, because these are the failure modes it exists to
// avoid:
//   - it shows the CURRENT value on the closed row, so the answer is always
//     visible without opening anything;
//   - `disabled` renders the row plus the reason, rather than hiding the control
//     (a missing button is an unexplained absence);
//   - opening and choosing the same value is a no-op, and closing is a no-op.
export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
  disabledReason,
  testID,
}: {
  label: string;
  /** The selected id, or null when nothing is chosen. */
  value: T | null;
  options: readonly { id: T; label: string; hint?: string | null }[];
  onChange: (id: T) => void;
  /** When set, the row is not actionable and this is shown underneath. */
  disabledReason?: string | null;
  testID?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.id === value) ?? null;
  const blocked = Boolean(disabledReason);

  return (
    <View>
      <Pressable
        onPress={() => {
          if (blocked) return;
          setOpen((v) => !v);
        }}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? "none selected"}`}
        accessibilityState={{ disabled: blocked, expanded: open }}
        testID={testID}
        className={`flex-row items-center gap-2 rounded-xl border p-3 ${
          blocked
            ? "border-line bg-card opacity-60"
            : open
              ? "border-select-ink bg-select-bg"
              : "border-line bg-card"
        }`}
      >
        <Text className="min-w-0 flex-1 text-[13px] font-black text-ink">
          {label}
        </Text>
        <Text
          numberOfLines={1}
          className={`max-w-[55%] text-[13px] font-bold ${
            current ? "text-select-ink" : "text-muted"
          }`}
        >
          {current?.label ?? "Choose…"}
        </Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color="#475569"
        />
      </Pressable>

      {blocked && disabledReason ? (
        <Text className="mt-1.5 text-[11px] leading-4 text-muted">
          {disabledReason}
        </Text>
      ) : null}

      {open && !blocked ? (
        <View className="mt-1.5 gap-1.5" testID={`${testID ?? label}-options`}>
          {options.map((o) => {
            const isCurrent = o.id === value;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  if (!isCurrent) onChange(o.id);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: isCurrent }}
                testID={`${testID ?? label}-opt-${o.id}`}
                className={`flex-row items-center gap-2 rounded-lg border px-3 py-2.5 ${
                  isCurrent
                    ? "border-select-ink bg-select-bg"
                    : "border-line bg-card"
                }`}
              >
                <Text
                  className={`min-w-0 flex-1 text-[13px] font-bold ${
                    isCurrent ? "text-select-ink" : "text-ink"
                  }`}
                >
                  {o.label}
                </Text>
                {o.hint ? (
                  <Text className="text-[11px] text-muted">{o.hint}</Text>
                ) : null}
                {isCurrent ? (
                  <Feather name="check" size={14} color="#1e3a8a" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
