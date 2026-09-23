// =====================================================================
// RouterPanel — the ONE "WiFi & Router" panel of the game-remote deck
// (device-round-5, A-26/A-27/A-28; R-15 layout rebuild 2026-09-18).
//
// Shown when the drive pads are HIDDEN (ESP_SER / website-server modes
// only — round-6: other hidden modes show the full OLED mirror instead).
// Renders:
//   • the active connection (car SSID + reachable IP, IP tappable → the
//     car's hosted web page),
//   • the saved-router LIST (names mirror — car `networks` JSON +
//     per-device savedRouters) with Switch + Delete per row,
//   • an Add form (SSID + password) that reaches the car over ANY live
//     link (ROUTERS;ADD;<ssid>;<pass>, dispatched by the car's
//     system-command hook in every mode).
//
// Security: passwords live ONLY on the car's NVS (W-14). The app holds
// the typed password in this component's local state for the flight of
// one ADD — it is never logged, never persisted, never echoed back.
//
// R-15 (owner review 2026-09-18 — "keyboard weird, page scrolls when it
// should not, use the space"): the old nested vertical+horizontal
// ScrollView with FIXED PIXEL card widths (260–380) forced a horizontal
// scroll in almost every landscape deck and pushed the focused input
// under the keyboard. Rebuilt simple & classic:
//   • ONE vertical ScrollView, used only when the deck is genuinely
//     shorter than the content — no horizontal scrolling, ever.
//   • Cards flex-wrap to the panel width: three across when wide,
//     two when medium, stacked when narrow (flexBasis + flexGrow —
//     the space is used, nothing is monotone-fixed).
//   • KeyboardAvoidingView now works on Android too ('height' — the
//     app already uses softwareKeyboardLayoutMode=resize) and
//     keyboardShouldPersistTaps keeps taps alive over the keyboard.
// =====================================================================
import React from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { RouterPanelProps } from "./types";
import { OWN_AP_NAME } from "../../services/carProtocol";

export function RouterPanel({
  canControl,
  linked,
  carSsid,
  carApName,
  ip,
  networks,
  onUse,
  onAdd,
  onDelete,
  onClear,
  onOpenWebPage,
}: RouterPanelProps) {
  const [ssid, setSsid] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const activeName = carSsid ?? carApName ?? null;
  const ipOut = ip || (linked ? "192.168.4.1" : null);
  const { width } = useWindowDimensions();
  // R-15: medium+ widths (landscape phones / tablets) share one row;
  // narrow portrait stacks the cards full-width.
  const isWide = width >= 640;

  // A-46 (round-9): the car's OWN network is pinned as a non-deletable
  // Default row and never enters the saved-list delete/switch path.
  const userNetworks = networks.filter((n) => n !== OWN_AP_NAME);

  const confirmClearAll = () => {
    // A-42: destructive — confirm before wiping every saved router (car NVS +
    // remote cache); the clear itself only ever references the own network as
    // the protected default (car T-62/T-66).
    Alert.alert(
      "Clear all routers?",
      `Removes every saved router from the car and the remote. The car keeps only its own ${OWN_AP_NAME} as the default.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => {
            if (!busy) onClear();
          },
        },
      ],
    );
  };

  const handleDelete = (name: string) => {
    if (name === OWN_AP_NAME) return;
    onDelete(name);
  };

  const handleAdd = () => {
    const s = ssid.trim();
    if (!s || busy) return;
    setBusy(true);
    onAdd(s, pass);
    setSsid("");
    setPass("");
    setTimeout(() => setBusy(false), 600);
  };

  // R-15: responsive card — flexGrow + flexBasis (never a fixed pixel width):
  // wide → all three share the row; medium → 2+1 wrap; narrow → stack.
  const cardStyle = { flexGrow: 1, flexBasis: isWide ? 220 : "100%" } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      className="min-h-0"
    >
      {/* Header */}
      <View className="flex-row items-center gap-2 px-1 pt-1">
        <Feather name="wifi" size={15} color="#1e3a8a" />
        <Text className="text-[13px] font-black uppercase tracking-widest text-navy">
          WiFi &amp; Router
        </Text>
        <View className="ml-auto flex-row items-center gap-1">
          <View
            className={`h-2.5 w-2.5 rounded-full ${linked ? "bg-emerald-500" : "bg-border"}`}
          />
          <Text
            className={`text-[11px] font-black uppercase tracking-wide ${linked ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}
          >
            {linked ? "LINK" : "NO LINK"}
          </Text>
        </View>
      </View>

      <View className="mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <ScrollView
          className="min-h-0 flex-1"
          contentContainerStyle={{ padding: 8, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {/* Row 1 (wide): active connection + saved routers side by side */}
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 8 }}>
            {/* A-35b · Card: active connection + IP (tappable → web page) */}
            <View
              style={cardStyle}
              className="shrink-0 grow rounded-xl bg-mist px-3 py-3 shadow-inner dark:bg-mist"
            >
              <Text className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted">
                Active connection
              </Text>
              <Text
                className="mt-1 text-[15px] font-bold text-ink dark:text-white"
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {activeName ?? (linked ? "Default router" : "\u2014")}
              </Text>
              {activeName && carApName && carApName !== carSsid ? (
                <Text
                  className="mt-0.5 text-[12px] text-muted"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  AP: {carApName}
                </Text>
              ) : null}
              {ipOut ? (
                <Pressable
                  onPress={onOpenWebPage}
                  accessibilityRole="link"
                  accessibilityLabel={`Open car web page at ${ipOut}`}
                  hitSlop={6}
                  className="mt-1.5 flex-row items-center gap-1.5"
                >
                  <Feather
                    name={linked ? "external-link" : "wifi"}
                    size={13}
                    color={linked ? "#0284c7" : "#64748b"}
                  />
                  <Text
                    className={`font-mono text-[13px] ${linked ? "text-sky-700 underline dark:text-sky-300" : "text-muted"}`}
                    numberOfLines={1}
                  >
                    {ipOut}
                    {!ip ? " (AP)" : ""}
                  </Text>
                </Pressable>
              ) : null}
              <Text className="mt-2 text-[11px] leading-4 text-muted">
                Tap the IP to open the car's page in a browser.
              </Text>
            </View>

            {/* Card: saved routers — own network pinned as Default (A-46) */}
            <View
              style={cardStyle}
              className="shrink-0 grow rounded-xl border border-line bg-mist p-3 dark:bg-mist"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-wide text-muted"
                  numberOfLines={1}
                >
                  Saved on the car
                  {userNetworks.length > 0
                    ? ` \u00b7 ${userNetworks.length}/6`
                    : ""}
                </Text>
                {userNetworks.length > 0 && (
                  <Pressable
                    onPress={confirmClearAll}
                    disabled={!linked}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all saved routers"
                    hitSlop={6}
                    className="shrink-0 flex-row items-center gap-1 rounded-full border border-red-300/50 bg-red-500/10 px-2 py-1 disabled:opacity-40"
                  >
                    <Feather name="trash-2" size={11} color="#dc2626" />
                    <Text className="text-[10px] font-black uppercase tracking-wide text-red-600 dark:text-red-400">
                      Clear all
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Pinned Default row — the car's OWN network (T-66): never deletable,
                  no Switch (it IS the fallback network). */}
              <View className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/10 px-2.5 py-2">
                <Feather name="wifi" size={12} color="#0284c7" />
                <Text
                  className="min-w-0 flex-1 text-[13px] font-bold text-ink dark:text-white"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {OWN_AP_NAME}
                </Text>
                <Text className="shrink-0 text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  Default
                </Text>
              </View>

              {userNetworks.length === 0 ? (
                <Text className="mt-1 text-[12px] leading-4 text-muted">
                  No saved routers yet — add one below.
                </Text>
              ) : (
                userNetworks.map((n) => (
                  <View
                    key={n}
                    className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2"
                  >
                    <Feather
                      name="wifi"
                      size={12}
                      color={n === carSsid ? "#059669" : "#64748b"}
                    />
                    <Text
                      className="min-w-0 flex-1 text-[13px] font-bold text-ink dark:text-white"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {n}
                    </Text>
                    {n === carSsid ? (
                      <Text className="shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Active
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => onUse(n)}
                        disabled={!linked}
                        accessibilityRole="button"
                        accessibilityLabel={`Switch the car to ${n}`}
                        hitSlop={6}
                        className="rounded-full border border-sky-500/50 bg-sky-500/15 px-2.5 py-1.5 disabled:opacity-40"
                      >
                        <Text className="text-[11px] font-black text-sky-700 dark:text-sky-300">
                          Switch
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => handleDelete(n)}
                      disabled={!linked}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${n} from the car`}
                      hitSlop={6}
                      className="rounded-full border border-line bg-card px-2.5 py-1.5 disabled:opacity-40"
                    >
                      <Text className="text-[11px] font-black text-muted">
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Card: add form — full width on its own row so the inputs never
              sit beside long router lists (R-15: keyboard stays predictable). */}
          <View className="grow rounded-xl border border-line bg-mist p-3 dark:bg-mist">
            <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
              Add a router
            </Text>
            <TextInput
              value={ssid}
              onChangeText={setSsid}
              editable={!busy}
              placeholder="WiFi name (SSID)"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              className="mt-1.5 h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
              placeholderTextColor="#64748b"
            />
            <TextInput
              value={pass}
              onChangeText={setPass}
              editable={!busy}
              placeholder="WiFi password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="send"
              onSubmitEditing={handleAdd}
              className="mt-2 h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
              placeholderTextColor="#64748b"
            />
            <Pressable
              onPress={handleAdd}
              disabled={busy || !ssid.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add this router to the car"
              className="mt-2 h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-sky-700 disabled:opacity-50"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="plus" size={14} color="#fff" />
              )}
              <Text className="text-[13px] font-black text-white">
                {busy ? "Saving…" : "Add + switch"}
              </Text>
            </Pressable>
            <Text className="mt-1.5 text-[11px] leading-4 text-muted">
              Stored on the car only — the password never leaves it (W-14).
            </Text>
            {!canControl && (
              <Text className="mt-1 text-[11px] leading-4 text-muted">
                Connect the car to manage routers.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
