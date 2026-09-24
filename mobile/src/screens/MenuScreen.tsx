// =====================================================================
// MenuScreen - the Menu tab. A compact destinations list that renders in
// the same space as Home / Shop / Cart (between the brand header and the
// bottom tab bar), so it never blocks or overlays the tabs.
//
// It carries the destinations that have no tab of their own, plus the
// app-update + theme controls (previously on the Account screen). Nothing
// here requires a sign-in: updates and theme work for guests too.
//
// C7 (2026-09-23): adds the Security + haptics preferences. Haptic
// feedback is a global toggle (default ON). The biometric admin lock is
// staff-only — it gates the Admin screen on this device — and enabling
// it requires a successful biometric prompt first.
// =====================================================================
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Pressable, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useApp } from "../context/AppContext";
import type { RootStackParamList } from "../navigation/types";
import {
  biometricsSupport,
  loadBiometricsPref,
  setBiometricsEnabled,
  type BiometricsSupport,
} from "../services/biometricsService";
import { loadHapticsPref, setHapticsEnabled } from "../services/hapticsService";

type RootNav = NativeStackNavigationProp<RootStackParamList, "Main">;
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
  { icon: "corner-down-left", label: "3D Printing", screen: "Printing" },
  { icon: "tool", label: "Open Tools", screen: "OpenTools" },
];

const COMPANY: Dest[] = [
  { icon: "cpu", label: "Control Panel", screen: "Tools" },
  { icon: "info", label: "About", screen: "About" },
  { icon: "phone", label: "Contact", screen: "Contact" },
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
      contentContainerStyle={{ paddingVertical: 12 }}
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
            onPress={() => navigation.push(d.screen)}
          />
        ))}
        <MenuItem
          icon="shield"
          label="Privacy Policy"
          onPress={() => navigation.push("Legal", { doc: "privacy" })}
        />
        <MenuItem
          icon="file-text"
          label="Terms of Service"
          onPress={() => navigation.push("Legal", { doc: "terms" })}
        />
      </MenuGroup>

      {/* Downloads & Software Updates - visible without signing in.
          R5: the bordered AppUpdateCard was removed — it duplicated the
          App Updates row right above it (owner: 'info items twice, remove
          the one with the borderline'). */}
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
        <View className="mx-3 flex-row items-center justify-between rounded-xl px-4 py-3.5">
          <MenuItem
            icon="sliders"
            label="Robot preferences"
            onPress={() => navigation.push("RobotPreferences")}
          />
          {!isPro ? (
            <View className="rounded-full bg-slate-200 px-2 py-0.5">
              <Text className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Pro
              </Text>
            </View>
          ) : null}
        </View>
      </MenuGroup>

      {/* Appearance - theme toggle moved here from the Account page */}
      <MenuGroup title="Appearance">
        <View className="mx-3 flex-row items-center justify-between rounded-xl px-4 py-3.5">
          <View className="flex-row items-center">
            <Feather
              name={themeMode === "dark" ? "moon" : "sun"}
              size={20}
              color="#64748b"
            />
            <Text className="ml-3.5 text-base font-semibold text-ink">
              Dark theme
            </Text>
          </View>
          <Switch
            value={themeMode === "dark"}
            onValueChange={(on) => setThemeMode(on ? "dark" : "light")}
            trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
            thumbColor="#ffffff"
            accessibilityLabel="Toggle dark theme"
          />
        </View>
      </MenuGroup>

      {/* C7: Security — the biometric admin lock, offered only to staff
          with biometrics available on the device. */}
      {isStaff && bioSupport?.supported ? (
        <MenuGroup title="Security">
          <View className="mx-3 flex-row items-center justify-between rounded-xl px-4 py-3.5">
            <View className="flex-row items-center">
              <Feather name="lock" size={20} color="#64748b" />
              <View className="ml-3.5 min-w-0 flex-1">
                <Text className="text-base font-semibold text-ink">
                  Biometric admin lock
                </Text>
                <Text numberOfLines={2} className="text-xs text-muted">
                  Ask for Face ID / fingerprint before opening the Admin screen
                  on this device.
                </Text>
              </View>
            </View>
            <Switch
              value={bioOn}
              disabled={bioBusy}
              onValueChange={(on) => void toggleBiometrics(on)}
              trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
              thumbColor="#ffffff"
              accessibilityLabel="Toggle biometric admin lock"
            />
          </View>
        </MenuGroup>
      ) : null}

      {/* C7: haptics on/off (everyone). Default ON — matches the previous
          always-vibrate behavior of the raw Vibration calls. */}
      <MenuGroup title="Feedback">
        <View className="mx-3 flex-row items-center justify-between rounded-xl px-4 py-3.5">
          <View className="flex-row items-center">
            <Feather name="zap" size={20} color="#64748b" />
            <View className="ml-3.5 min-w-0 flex-1">
              <Text className="text-base font-semibold text-ink">
                Haptic feedback
              </Text>
              <Text numberOfLines={1} className="text-xs text-muted">
                Vibrate on taps, mode changes, and confirmations.
              </Text>
            </View>
          </View>
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
        </View>
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
  children: React.ReactNode;
}) {
  return (
    <View className="pt-4">
      <Text className="px-5 pb-2 text-xs font-black uppercase tracking-widest text-border">
        {title}
      </Text>
      {children}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-3 flex-row items-center rounded-xl px-4 py-3.5 active:bg-mist"
    >
      <Feather name={icon} size={20} color="#64748b" />
      {/* R5 overflow fix: min-w-0 + flex-1 + numberOfLines so long labels
          never push past the card's right edge. */}
      <Text
        numberOfLines={1}
        className="ml-3.5 min-w-0 flex-1 text-base font-semibold text-ink"
      >
        {label}
      </Text>
    </Pressable>
  );
}
