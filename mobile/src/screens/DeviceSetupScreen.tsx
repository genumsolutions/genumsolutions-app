// =====================================================================
// DeviceSetupScreen — the first screen of the connection flow.
//
// Designed so EVERY possible connection method has a row, a placeholder
// setup + a "Continue" that hands off to the device connection screen.
//   • Bluetooth Classic SPP   — completed, the hand-held remote's path.
//   • Bluetooth LE (BLE)      — placeholder; the ESP remote approach with
//                               an incomplete BLE layer: slot for it.
//   • Wi-Fi AP (own AP)       — the car's always-on 192.168.245.1 WS.
//   • Wi-Fi STA (router)      — after provisioning, the car's DHCP IP + WS.
//   • ESP remote (placeholder) — the ESP remote's own server/control path:
//                               built-on-the-fly via the phone's JS bridge,
//                               not wired yet. Listed so the user sees it.
// "Continue" goes to DeviceConnectionScreen for the chosen kind.
// =====================================================================
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import type { RootStackParamList } from "../navigation/types";
import { feedbackTap } from "../services/hapticsService";

type Step = "device" | "type" | "done";

// U-49 (2026-09-28): the connection wizard's first screen. Every link method
// gets a row so the shape of the fleet is visible, and only the methods the
// app can actually drive today are marked built.
const CONNECTION_KINDS = [
  {
    id: "bluetooth-spp",
    label: "Bluetooth (Classic SPP)",
    icon: "bluetooth",
    desc: "Pairs like the hand-held remote. PIN: 1234.",
    status: "built",
  },
  {
    id: "wifi-ap-own",
    label: "Wi-Fi AP (own AP)",
    icon: "wifi",
    desc: "Phone joins the car's own AP — WebSocket drive.",
    status: "built",
  },
  {
    id: "wifi-sta",
    label: "Wi-Fi STA (router)",
    icon: "wifi",
    desc: "After provisioning — the car's DHCP IP + drive.",
    status: "built",
  },
  {
    id: "bluetooth-ble",
    label: "Bluetooth LE (BLE)",
    icon: "bluetooth",
    desc: "ESP remote BLE control — layer not wired yet.",
    status: "placeholder",
  },
  {
    id: "wifi-ap",
    label: "Wi-Fi / ESP Remote",
    icon: "wifi",
    desc: "ESP Remote control via the phone — not wired yet.",
    status: "placeholder",
  },
] as const;

export function DeviceSetupScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [deviceName, setDeviceName] = useState("GENUM Car");
  const [connTab, setConnTab] =
    useState<(typeof CONNECTION_KINDS)[number]["id"]>("bluetooth-spp");

  const goNext = useCallback(() => {
    feedbackTap();
    navigation.replace("DeviceConnection", {
      kind: connTab,
      deviceName: deviceName.trim() || "GENUM Car",
    });
  }, [connTab, deviceName, navigation]);

  return (
    <ScrollView
      className="flex-1 bg-mist"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* Header */}
      <View className="mb-5 flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">
            Device Setup
          </Text>
          <Text className="mt-2 font-display text-2xl font-bold text-ink">
            Connect your device
          </Text>
        </View>
      </View>

      {/* Device name */}
      <View className="mt-6 rounded-2xl border border-line bg-card p-4 shadow-card">
        <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
          Device name
        </Text>
        <TextInput
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="GENUM Car"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          className="mt-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink"
        />
      </View>

      {/* Choose connection kind */}
      <View className="mt-4 rounded-2xl border border-line bg-card p-4 shadow-card">
        <Text className="text-xs font-black uppercase tracking-[0.2em] text-muted">
          Connection type
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {CONNECTION_KINDS.map((k) => (
            <Pressable
              key={k.id}
              onPress={() => setConnTab(k.id)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${k.label}`}
              accessibilityState={{ selected: k.id === connTab }}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${
                k.id === connTab
                  ? "bg-navy shadow-sm"
                  : "border border-line bg-mist"
              }`}
            >
              <Feather
                name={k.icon}
                size={14}
                color={k.id === connTab ? "#fff" : "#94a3b8"}
              />
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className={`text-xs font-black ${
                    k.id === connTab ? "text-white" : "text-navy"
                  }`}
                >
                  {k.label}
                </Text>
                <Text
                  numberOfLines={1}
                  className={`text-[10px] font-semibold ${k.id === connTab ? "text-white/70" : "text-muted"}`}
                >
                  {k.desc}
                </Text>
              </View>
              <Text
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  k.status === "built" ? "text-green-600" : "text-amber-600"
                }`}
              >
                {k.status}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Continue */}
      <Pressable
        onPress={goNext}
        accessibilityRole="button"
        accessibilityLabel="Continue to connect this device"
        className="mt-6 flex-row items-center justify-center gap-2 rounded-full bg-navy px-6 py-3.5"
      >
        <Feather name="arrow-right" size={14} color="#fff" />
        <Text className="text-sm font-black text-white">Continue</Text>
      </Pressable>

      <Text className="mt-3 text-center text-[11px] text-muted">
        Bluetooth is the zero-setup path — Wi-Fi needs the car&apos;s AP or your
        router first.
      </Text>
    </ScrollView>
  );
}
