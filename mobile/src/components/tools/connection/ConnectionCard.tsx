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
// Nothing here decides anything. Screens pass content in; the decisions all
// live in the pure model (`connection/`).
// =====================================================================

import React from "react";
import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

export type CardTone = "idle" | "busy" | "live" | "error";

const TONE_DOT: Record<CardTone, string> = {
  idle: "bg-border",
  busy: "bg-amber-500",
  live: "bg-emerald-500",
  error: "bg-red-500",
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
            color={selected ? "#0369a1" : "#64748b"}
          />
        ) : null}
        <Text
          className={`min-w-0 flex-1 text-[13px] font-black ${
            selected
              ? "text-sky-900 dark:text-sky-300"
              : "text-ink dark:text-white"
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

  const frame = `rounded-xl border p-3 ${
    selected
      ? "border-sky-500/60 bg-sky-500/5"
      : tone === "error"
        ? "border-red-500/50 bg-red-500/5"
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
  const tone =
    variant === "primary"
      ? "bg-sky-700"
      : variant === "danger"
        ? "border border-red-300/60 bg-red-500/10"
        : "border border-line bg-card";
  const text =
    variant === "primary"
      ? "text-white"
      : variant === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-ink dark:text-white";
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
      } ${disabled ? "opacity-40" : "active:opacity-70"}`}
    >
      {icon ? (
        <Feather
          name={icon}
          size={14}
          color={variant === "primary" ? "#ffffff" : "#64748b"}
        />
      ) : null}
      <Text className={`text-[13px] font-black ${text}`}>{label}</Text>
    </Pressable>
  );
}

/** ONE error surface, for every outcome of every action in the section. */
export function InlineMessage({
  tone,
  children,
}: {
  tone: "error" | "ok" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-500/50 bg-red-500/5 text-red-700 dark:text-red-300"
      : tone === "ok"
        ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
        : "border-line bg-card text-muted";
  return (
    <View className={`mt-2 rounded-lg border px-3 py-2 ${toneClass}`}>
      <Text className="text-[11px] leading-4">{children}</Text>
    </View>
  );
}
