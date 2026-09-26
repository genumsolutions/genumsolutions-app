// =====================================================================
// MenuScreen - the Menu tab. A compact destinations list that renders in
// the same space as Home / Shop / Cart (between the brand header and the
// bottom tab bar), so it never blocks or overlays the tabs.
//
// U-23 (2026-09-24): ONE MenuItem row component now drives nav rows (with
// a chevron) and toggle rows (with a Switch in the same `right` slot) —
// no more hand-written, double-padded View+Switch markup. Each row keeps
// a consistent 48pt-tall touch target and a muted icon chip.
// =====================================================================
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { useApp } from "../context/AppContext";
import type { RootStackParamList } from "../navigation/types";
import {
  biometricsSupport,
  loadBiometricsPref,
  setBiometricsEnabled,
  type BiometricsSupport,
} from "../services/biometricsService";
import { loadHapticsPref, setHapticsEnabled } from "../services/hapticsService";

type IconName = ComponentProps<typeof Feather>["name"];

type Dest = {
  icon: IconName;
  label: string;
  screen?: string;
};

const EXPLORE: Dest[] = [
  { icon: "briefcase", label: "Services", screen: "Services" },
  { icon: "layers", label: "Projects", screen: "Projects" },
  { icon: "book-open", label: "Journal", screen: "Journal" },
  // U-47v2 (owner): "3D Printing" removed — the 3D Products bottom-tab
  // (PrintingScreen) IS the 3D store; the menu entry duplicated it.
  { icon: "tool", label: "Open Tools", screen: "OpenTools" },
];

const COMPANY: Dest[] = [
  { icon: "cpu", label: "Control Panel", screen: "Tools" },
  { icon: "info", label: "About", screen: "About" },
  { icon: "phone", label: "Contact", screen: "Contact" },
  { icon: "shield", label: "Privacy Policy", screen: "Legal" },
  { icon: "file-text", label: "Terms of Service", screen: "Legal" },
];

export function MenuScreen() {
  const navigation = useNavigation<any>();
  const { isStaff, isPro, themeMode, setThemeMode } = useApp();

  // C7: haptics toggle (everyone). Default ON, hydrated once on mount.
  const [hapticsOn, setHapticsOn] = useState(true);
  useEffect(() => {
    void loadHapticsPref().then(setHapticsOn);
  }, []);

  // C7: biometric admin lock (staff only). The support probe decides
  // whether the row renders at all; unsupported devices show nothing.
  const [bioSupport, setBioSupport] = useState<BiometricsSupport | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  useEffect(() => {
    if (!isStaff) return;
    void (async () => {
      const support = await biometricsSupport();
      setBioSupport(support);
      if (support.supported) {
        setBioOn(await loadBiometricsPref());
      }
    })();
  }, [isStaff]);

  const toggleBiometrics = async (on: boolean) => {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      const ok = await setBiometricsEnabled(on);
      // Enabling is rejected when the biometric prompt fails/cancelled —
      // the switch stays off in that case.
      setBioOn(ok);
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
    >
      <MenuGroup title="Explore">
        {EXPLORE.map((d) => (
          <MenuItem
            key={d.label}
            icon={d.icon}
            label={d.label}
            onPress={() => navigation.push(d.screen)}
          />
        ))}
      </MenuGroup>

      <MenuGroup title="Company">
        {COMPANY.map((d) => (
          <MenuItem
            key={d.label}
            icon={d.icon}
            label={d.label}
            onPress={() =>
              d.screen === "Legal"
                ? navigation.push("Legal", {
                    doc: d.label === "Privacy Policy" ? "privacy" : "terms",
                  })
                : navigation.push(d.screen)
            }
          />
        ))}
      </MenuGroup>

      {/* Downloads & Software Updates - visible without signing in. */}
      <MenuGroup title="Downloads & Software Updates">
        <MenuItem
          icon="download"
          label="App Updates"
          onPress={() => navigation.push("Update")}
        />
      </MenuGroup>

      {/* Robot preferences (2026-09-22): per-robot code values / parameters /
          telemetry channels for the signed-in user. Pro feature — the screen
          itself explains the tier gate to free users. */}
      <MenuGroup title="Robot Settings">
        <MenuItem
          icon="sliders"
          label="Robot preferences"
          onPress={() => navigation.push("RobotPreferences")}
          right={
            isPro ? undefined : (
              <View className="rounded-full bg-mist px-2 py-0.5">
                <Text className="text-[10px] font-black uppercase tracking-wide text-muted">
                  Pro
                </Text>
              </View>
            )
          }
        />
      </MenuGroup>

      {/* Appearance - theme toggle moved here from the Account page */}
      <MenuGroup title="Appearance">
        <MenuItem
          icon={themeMode === "dark" ? "moon" : "sun"}
          label="Dark theme"
          onPress={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
          right={
            <Switch
              value={themeMode === "dark"}
              onValueChange={(on) => setThemeMode(on ? "dark" : "light")}
              trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
              thumbColor="#ffffff"
              accessibilityLabel="Toggle dark theme"
            />
          }
        />
      </MenuGroup>

      {/* C7: Security — the biometric admin lock, offered only to staff
          with biometrics available on the device. */}
      {isStaff && bioSupport?.supported ? (
        <MenuGroup title="Security">
          <MenuItem
            icon="lock"
            label="Biometric admin lock"
            hint="Face ID / fingerprint before opening the Admin screen"
            right={
              <Switch
                value={bioOn}
                disabled={bioBusy}
                onValueChange={(on) => void toggleBiometrics(on)}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
                thumbColor="#ffffff"
                accessibilityLabel="Toggle biometric admin lock"
              />
            }
          />
        </MenuGroup>
      ) : null}

      {/* C7: haptics on/off (everyone). Default ON — matches the previous
          always-vibrate behavior of the raw Vibration calls. */}
      <MenuGroup title="Feedback">
        <MenuItem
          icon="zap"
          label="Haptic feedback"
          hint="Vibrate on taps, mode changes, and confirmations"
          onPress={() => {
            setHapticsOn(!hapticsOn);
            void setHapticsEnabled(!hapticsOn);
          }}
          right={
            <Switch
              value={hapticsOn}
              onValueChange={(on) => {
                setHapticsOn(on);
                void setHapticsEnabled(on);
              }}
              trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
              thumbColor="#ffffff"
              accessibilityLabel="Toggle haptic feedback"
            />
          }
        />
      </MenuGroup>

      {isStaff ? (
        <MenuGroup title="Admin">
          <MenuItem
            icon="settings"
            label="Admin Dashboard"
            onPress={() => navigation.push("Admin")}
          />
        </MenuGroup>
      ) : null}
    </ScrollView>
  );
}

function MenuGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="pt-4">
      <Text className="px-5 pb-2 text-xs font-black uppercase tracking-widest text-muted">
        {title}
      </Text>
      <View className="overflow-hidden rounded-2xl border border-line bg-card">
        {children}
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onPress,
  right,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const content = (
    <>
      {/* Muted icon chip keeps every row visually aligned. */}
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-mist">
        <Feather name={icon} size={17} color="#64748b" />
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base font-semibold text-ink">
          {label}
        </Text>
        {hint ? (
          <Text
            numberOfLines={2}
            className="mt-0.5 text-xs leading-4 text-muted"
          >
            {hint}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Feather name="chevron-right" size={18} color="#94a3b8" />
        ) : null)}
    </>
  );

  if (!onPress) {
    return (
      <View className="min-h-[48px] flex-row items-center px-4 py-2.5">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[48px] flex-row items-center border-b border-line px-4 py-2.5 last:border-b-0 active:bg-mist"
    >
      {content}
    </Pressable>
  );
}
