// =====================================================================
// WifiPanel — ONE list, the way the phone's own Wi-Fi settings work.
//
// U-84 (owner, 2026-10-03). The complaint was that the Wi-Fi half of the
// Control Panel was "too messy and shows lots of unnecessary things like
// guidance text in subtitles and the useless division of the esp32 hotspot and
// the other home router", and asked for it to behave like the phone's internal
// Wi-Fi: search, and a simple switching mechanism.
//
// What was actually wrong, all three confirmed in the code:
//
//  1. THREE controls did one job. The method card asked "Where is the car?"
//     (a dropdown splitting "The car's hotspot" from "Your home router"), the
//     target body then showed a "Connect to …" button for whichever was picked,
//     and RouterManager separately offered a scan, an add form, a Remove button
//     and a Manage card. One decision, four places.
//
//  2. FOUR instruction blocks told the user what to do instead of doing it —
//     "…is always available if no router works", "The car's own hotspot stays
//     available as a fallback", "No routers saved on the car yet. Add one — the
//     car keeps it after a power cycle", and "N saved. Use \"Switch the car to\"
//     in the card above…". The last one is the clearest symptom: the UI was
//     narrating its own layout because the layout had become unclear.
//
//  3. The car-AP and home-router split is an artefact of how the phone reaches
//     the car, not something a user thinks in. A phone's Wi-Fi list does not
//     separate "the hotspot" from "my router"; it lists networks.
//
// So this component is a flat list. Saved networks first (the car's own hotspot
// among them, tagged rather than sectioned off), then anything the scan found,
// then one "Add network" row. Tapping a row switches the car to it — the single
// switching mechanism. There is no second dropdown and no narration.
//
// SAFETY, unchanged: the car's own hotspot stays visible but is not a switch
// target (F-63). Switching the car onto its own AP is what erased the stored
// credentials, so it is shown, labelled, and left alone.
//
// Everything shown here is something the car actually reported. Unknown values
// are not invented (F-62).
// =====================================================================
import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { InlineMessage } from "./ConnectionCard";
import {
  canAddRouter,
  switchableRouters,
  validateRouterInput,
  type RouterEntry,
} from "./routerList";

export type ScannedNetwork = {
  readonly ssid: string;
  readonly rssi: number;
  readonly open: boolean;
};

export type WifiPanelProps = {
  /** Exactly what the car reported in NETW;… — the only source of truth. */
  routers: readonly RouterEntry[];
  /** What the car's own scan found nearby. */
  scanned: readonly ScannedNetwork[];
  busy: boolean;
  /** True when the car is reachable, so switching is possible at all. */
  reachable: boolean;
  onSwitch: (ssid: string) => void;
  onForget: (ssid: string) => void;
  onAdd: (ssid: string, pass: string) => void;
  onEdit: (ssid: string, newPass: string) => void;
  onScan: () => void;
  onInputFocus?: (y: number) => void;
  /** Shown after a switch so the phone follows the car (Android cannot do it silently). */
  pendingSsid?: string | null;
};

type Row = {
  ssid: string;
  /** "active" is the network the car says it joined. */
  state: "active" | "saved" | "hotspot" | "nearby";
  meta: string | null;
  switchable: boolean;
  /** U-93: saved rows can be edited (set a new password on the car). */
  editable: boolean;
};

export function WifiPanel({
  routers,
  scanned,
  busy,
  reachable,
  onSwitch,
  onForget,
  onAdd,
  onEdit,
  onScan,
  onInputFocus,
  pendingSsid,
}: WifiPanelProps) {
  const [adding, setAdding] = useState(false);
  // U-93: editing an existing entry = setting a NEW password for it (the car
  // never echoes a stored password — W-14 — so the form never prefills).
  const [editingSsid, setEditingSsid] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only the car's own reserved network is excluded from switching (F-63).
  const ownAp = routers.find((r) => r.isOwnAp);
  const canAdd = canAddRouter(routers as RouterEntry[]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    // Derived here (not from the outer scope) so this memo does not depend on
    // an array that is rebuilt on every render.
    const canSwitch = new Set(
      switchableRouters(routers as RouterEntry[]).map((r) => r.ssid),
    );

    // The active network leads: it is what the car is on right now. A
    // non-active entry must NOT be consumed here, or the pass below would
    // treat it as already listed and silently drop it.
    for (const r of routers) {
      if (seen.has(r.ssid) || !r.isActive) continue;
      seen.add(r.ssid);
      out.push({
        ssid: r.ssid,
        state: "active",
        meta: "Connected",
        switchable: false,
        editable: false,
      });
    }
    for (const r of routers) {
      if (seen.has(r.ssid)) continue;
      seen.add(r.ssid);
      if (r.isOwnAp) {
        // U-86: the hotspot is a normal, tappable row again. It used to be
        // listed but permanently disabled, so there was no way back to it from
        // the app. planSwitch now emits a single USE step for it, and the
        // firmware's T-66 handler keeps the saved-router registry intact.
        out.push({
          ssid: r.ssid,
          state: "hotspot",
          meta: "Car hotspot",
          switchable: true,
          editable: false,
        });
      } else if (canSwitch.has(r.ssid)) {
        out.push({
          ssid: r.ssid,
          state: "saved",
          meta: null,
          switchable: true,
          // U-93: saved rows are editable — the owner's "not able to edit
          // those". Edit sets a NEW password for the name (W-14: never
          // prefilled; the car never echoes one).
          editable: true,
        });
      }
    }
    // Nearby networks the car can see. Anything already listed is skipped, so
    // the same network never appears twice with two meanings.
    for (const n of scanned) {
      if (seen.has(n.ssid)) continue;
      seen.add(n.ssid);
      out.push({
        ssid: n.ssid,
        state: "nearby",
        meta: n.open ? `${n.rssi} dBm` : `${n.rssi} dBm · locked`,
        switchable: false,
        editable: false,
      });
    }
    return out;
  }, [routers, scanned]);

  const validation = validateRouterInput(ssid, pass, {
    ownApName: ownAp?.ssid ?? null,
  });

  const submit = () => {
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }
    setError(null);
    // U-93: an edit keeps the row's name and hands over the NEW password —
    // the same ADD upsert the add path uses (the car treats ADD as an upsert
    // by SSID, verified on the car in U-88's bench matrix).
    if (editingSsid) {
      onEdit(editingSsid, pass);
    } else {
      onAdd(ssid.trim(), pass);
    }
    // The password is handed straight to the car and never kept (W-14).
    setSsid("");
    setPass("");
    setEditingSsid(null);
    setAdding(false);
  };

  const cancel = () => {
    setAdding(false);
    setSsid("");
    setPass("");
    setEditingSsid(null);
    setError(null);
  };

  return (
    <View testID="wifi-panel">
      {/* After a switch the phone is on the wrong network, so say so plainly
          and once. Android will not join a Wi-Fi network silently. */}
      {pendingSsid ? (
        <View className="mb-2.5 rounded-xl border border-line bg-card p-3">
          <View className="flex-row items-start gap-2">
            <Feather name="smartphone" size={15} color="#1e3a8a" />
            <Text className="flex-1 text-[13px] leading-5 text-ink">
              The car is switching to{" "}
              <Text className="font-bold">{pendingSsid}</Text>. Join that
              network on this phone to stay connected to the car.
            </Text>
          </View>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text className="py-1 text-[13px] text-muted">No networks yet.</Text>
      ) : (
        <View className="overflow-hidden rounded-xl border border-line bg-card">
          {rows.map((r, i) => (
            <View
              key={`${r.ssid}-${i}`}
              className={i === 0 ? "" : "border-t border-line"}
            >
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => {
                    if (!r.switchable || busy) return;
                    onSwitch(r.ssid);
                  }}
                  disabled={!r.switchable || busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    r.switchable
                      ? `Use ${r.ssid}`
                      : `${r.ssid}, ${r.meta ?? ""}`
                  }
                  accessibilityState={{
                    selected: r.state === "active",
                    disabled: !r.switchable,
                  }}
                  className="flex-1 flex-row items-center gap-2.5 px-3 py-3"
                  testID={`wifi-row-${r.ssid}`}
                >
                  <Feather
                    name={
                      r.state === "active"
                        ? "check-circle"
                        : r.state === "hotspot"
                          ? "wifi"
                          : r.state === "nearby"
                            ? "search"
                            : "wifi"
                    }
                    size={16}
                    color={r.state === "active" ? "#059669" : "#1e3a8a"}
                  />
                  <Text
                    numberOfLines={1}
                    className={`flex-1 text-[14px] ${
                      r.state === "active"
                        ? "font-bold text-ink"
                        : r.switchable
                          ? "font-semibold text-ink"
                          : "font-semibold text-muted"
                    }`}
                  >
                    {r.ssid}
                  </Text>
                  {r.meta ? (
                    <Text className="text-[12px] text-muted">{r.meta}</Text>
                  ) : null}
                </Pressable>
                {/* Forgetting is per-row and deliberately quiet: it must not
                    compete with the one action that matters, switching. */}
                {r.state === "saved" ? (
                  <>
                    {/* U-93: Edit = set a new password for this network. */}
                    <Pressable
                      onPress={() => {
                        setEditingSsid(r.ssid);
                        setSsid(r.ssid);
                        setPass("");
                        setError(null);
                        setAdding(true);
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${r.ssid}`}
                      className="px-3 py-3"
                      testID={`wifi-edit-${r.ssid}`}
                    >
                      <Feather name="edit-2" size={15} color="#1e3a8a" />
                    </Pressable>
                    {/* Forgetting is per-row and deliberately quiet: it must not
                        compete with the one action that matters, switching. */}
                    <Pressable
                      onPress={() => onForget(r.ssid)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${r.ssid}`}
                      className="px-3 py-3"
                      testID={`wifi-forget-${r.ssid}`}
                    >
                      <Feather name="trash-2" size={15} color="#64748b" />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Scanning is how a new network is found — the phone's own "refresh".
          U-93: when it cannot work, it SAYS why (the owner's "router select
          not working sometime" — a silently dead button reads as a bug). */}
      <Pressable
        onPress={onScan}
        disabled={busy || !reachable}
        accessibilityRole="button"
        accessibilityLabel="Search for networks"
        className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl border border-line bg-card py-3"
        testID="wifi-scan"
      >
        <Feather name="refresh-cw" size={14} color="#1e3a8a" />
        <Text className="text-[13px] font-bold text-navy">
          {busy
            ? "Searching…"
            : reachable
              ? "Search for networks"
              : "Connect to the car to search"}
        </Text>
      </Pressable>

      {adding ? (
        <View className="mt-2.5 gap-2" testID="wifi-add-form">
          {editingSsid ? (
            <Text
              className="text-[13px] font-bold text-ink"
              testID="wifi-edit-title"
            >
              Set a new password for “{editingSsid}”
            </Text>
          ) : null}
          <View onLayout={(e) => onInputFocus?.(e.nativeEvent.layout.y)}>
            <TextInput
              value={ssid}
              onChangeText={(v) => {
                setSsid(v);
                setError(null);
              }}
              placeholder="Network name"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Network name"
              maxLength={40}
              returnKeyType="next"
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink"
              testID="wifi-ssid"
            />
          </View>
          <View onLayout={(e) => onInputFocus?.(e.nativeEvent.layout.y)}>
            <TextInput
              value={pass}
              onChangeText={(v) => {
                setPass(v);
                setError(null);
              }}
              placeholder="Password"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Network password"
              maxLength={72}
              returnKeyType="done"
              onSubmitEditing={submit}
              className="h-11 rounded-lg border border-line bg-card px-3 text-[14px] text-ink"
              testID="wifi-pass"
            />
          </View>
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          <View className="flex-row gap-2">
            <Pressable
              onPress={submit}
              disabled={
                busy || !ssid.trim() || (editingSsid != null && !pass.trim())
              }
              accessibilityRole="button"
              accessibilityLabel="Save network"
              className="flex-1 items-center rounded-full bg-navy py-3"
              testID="wifi-add-submit"
            >
              <Text className="text-[13px] font-black text-white">
                {editingSsid ? "Save password" : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={cancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="items-center rounded-full border border-line bg-card px-5 py-3"
            >
              <Text className="text-[13px] font-bold text-navy">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Add network"
          className="mt-2 flex-row items-center justify-center gap-2 py-2"
          testID="wifi-add-open"
        >
          <Feather name="plus" size={15} color="#1e3a8a" />
          <Text className="text-[13px] font-bold text-navy">Add network</Text>
        </Pressable>
      )}
    </View>
  );
}
