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
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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

/**
 * U-70 parity (owner: *"the item list of the exposed router needs the scrolling
 * bar not open long list of the items"*). The saved + scanned list is a BOUNDED
 * scrolling window with its own scrollbar — roughly six rows. Without this it
 * rendered inline in the page ScrollView, so a long list grew the whole page
 * and pushed the actions off the bottom. This mirrors DEVICE_LIST_MAX_HEIGHT in
 * ConnectionSection: a nested vertical scroller of unbounded height just grows
 * forever, so the outer page scroller cannot do this job.
 */
const ROUTER_LIST_MAX_HEIGHT = 240;

/**
 * U-121 Phase C (owner 2026-10-23): *"the field space to enter the router name
 * and password is too small and hard to read … the keyboard used to enter the
 * data there is weird shape and size in the landscape view."* The inline form
 * (and its bounded-scroller workaround from 2026-10-12, `ADD_FORM_MAX_HEIGHT`
 * / `ADD_FORM_MIN_HEIGHT`, both GONE) is replaced by a CENTERED MODAL CARD:
 * one fixed readable width with labelled h-12 / 15 px fields and real
 * Save/Cancel buttons, so the landscape split keyboard can never squeeze it
 * against the panel edge again. Android resizes the app under the keyboard
 * (`softwareKeyboardLayoutMode: resize` in app.json) and the card stays
 * centered; iOS is padded by KeyboardAvoidingView.
 */
const ADD_FORM_MAX_WIDTH = 420;

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
  /** Send a raw command to the car (e.g., ROUTERS;SCAN;CANCEL). */
  sendCmd: (cmd: string) => void;
  /** Called when a text field gains focus, so the host can scroll it clear of
      the keyboard (F-69). No argument: the host scrolls its own pane. */
  onInputFocus?: () => void;
  /** Shown after a switch so the phone follows the car (Android cannot do it silently). */
  pendingSsid?: string | null;
  /** Owner (2026-10-11): the Control Panel list is REDUCED — it keeps the
      connect/switch/scan actions and drops the add/edit/delete cluster, which
      now lives on the Remote screen's Connectivity panel (one manager, no
      duplicate).
      When `false`, the per-row Edit/Forget and the "Add network" form are not
      rendered; a short pointer names where they moved. */
  manage?: boolean;
  /** M1 (owner 2026-10-13): *"networks on the car … keep only paired or saved
      network list after the search."* Nearby networks the car's antenna hears
      are only rendered after an EXPLICIT "Search for networks" tap (the host
      flips this true on a confirmed scan and clears it when the section
      resets). The default is true so a reduced caller keeps the old behaviour. */
  showScanned?: boolean;
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
  sendCmd,
  onInputFocus,
  pendingSsid,
  manage = true,
  showScanned = true,
}: WifiPanelProps) {
  const [adding, setAdding] = useState(false);
  // U-93: editing an existing entry = setting a NEW password for it (the car
  // never echoes a stored password — W-14 — so the form never prefills).
  const [editingSsid, setEditingSsid] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Keyboard-return flow: SSID "next" moves focus to the password field.
  const passRef = useRef<TextInput>(null);

  // Only the car's own reserved network is excluded from switching (F-63).
  const ownAp = routers.find((r) => r.isOwnAp);
  const canAdd = canAddRouter(routers as RouterEntry[]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    // ONE key for the whole builder: case-insensitive and empty-safe. The car
    // can report the same network with different casing, and a scan row can
    // arrive with an empty SSID (a hidden beacon). Matching raw strings let
    // BOTH through — a second copy of a network already listed, and a nameless
    // "nearby" row (a blank Wi-Fi entry with no name). Normalising the key
    // here is what keeps every network to exactly one row.
    const keyOf = (s: string) => (s ?? "").trim().toUpperCase();
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
      const k = keyOf(r.ssid);
      if (!k || seen.has(k) || !r.isActive) continue;
      seen.add(k);
      out.push({
        ssid: r.ssid,
        state: "active",
        meta: "Connected",
        switchable: false,
        editable: false,
      });
    }
    for (const r of routers) {
      const k = keyOf(r.ssid);
      if (!k || seen.has(k)) continue;
      seen.add(k);
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
    // the same network never appears twice with two meanings. M1: only shown
    // after an EXPLICIT user search (owner 2026-10-13: the list must not mix
    // random nearby beacons with the car's saved networks — "keep only paired
    // or saved network list after the search").
    if (showScanned) {
      for (const n of scanned) {
        const k = keyOf(n.ssid);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push({
          ssid: n.ssid,
          state: "nearby",
          meta: n.open ? `${n.rssi} dBm` : `${n.rssi} dBm · locked`,
          switchable: false,
          editable: false,
        });
      }
    }
    return out;
  }, [routers, scanned, showScanned]);

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
      {/* After a switch the phone is on the wrong network, so say so once.
          Android will not join a Wi-Fi network silently, so this is an action
          the user has to take — but owner 2026-10-10: no guidance subtitles,
          short and minimal. One imperative line, no paragraph. */}
      {pendingSsid ? (
        <View className="mb-2 rounded-lg border border-line bg-card p-2">
          <View className="flex-row items-center gap-1.5">
            <Feather name="smartphone" size={12} color="#1e3a8a" />
            <Text className="flex-1 text-[11px] leading-4 text-ink">
              Join <Text className="font-bold">{pendingSsid}</Text> on this
              phone
            </Text>
          </View>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text className="py-0.5 text-[11px] text-muted">No networks yet.</Text>
      ) : (
        <ScrollView
          className="overflow-hidden rounded-lg border border-line bg-card"
          style={{ maxHeight: ROUTER_LIST_MAX_HEIGHT }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {rows.map((r, i) => (
            <View
              key={`${r.ssid}-${i}`}
              className={i === 0 ? "" : "border-t border-line"}
            >
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => {
                    if (!r.switchable || busy || !reachable) return;
                    onSwitch(r.ssid);
                  }}
                  disabled={!r.switchable || busy || !reachable}
                  accessibilityRole="button"
                  accessibilityLabel={
                    r.switchable && reachable
                      ? `Use ${r.ssid}`
                      : `${r.ssid}, ${r.meta ?? ""}`
                  }
                  accessibilityState={{
                    selected: r.state === "active",
                    disabled: !r.switchable || !reachable,
                  }}
                  className="flex-1 flex-row items-center gap-2 px-2 py-1.5"
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
                    size={13}
                    color={r.state === "active" ? "#059669" : "#1e3a8a"}
                  />
                  <Text
                    numberOfLines={1}
                    className={`flex-1 text-[12px] ${
                      r.state === "active"
                        ? "font-bold text-ink"
                        : r.switchable && reachable
                          ? "font-semibold text-ink"
                          : "font-semibold text-muted"
                    }`}
                  >
                    {r.ssid}
                  </Text>
                  {r.meta ? (
                    <Text className="text-[10px] text-muted">{r.meta}</Text>
                  ) : null}
                </Pressable>
                {/* Forgetting is per-row and deliberately quiet: it must not
                    compete with the one action that matters, switching. Only
                    rendered when this list owns management (the Remote's
                    Connectivity panel does it now — see `manage`). */}
                {r.state === "saved" && manage ? (
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
                      disabled={busy || !reachable}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${r.ssid}`}
                      className="px-2 py-1.5"
                      testID={`wifi-edit-${r.ssid}`}
                    >
                      <Feather name="edit-2" size={12} color="#1e3a8a" />
                    </Pressable>
                    {/* Forgetting is per-row and deliberately quiet: it must not
                        compete with the one action that matters, switching. */}
                    <Pressable
                      onPress={() => onForget(r.ssid)}
                      disabled={busy || !reachable}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${r.ssid}`}
                      className="px-2 py-1.5"
                      testID={`wifi-forget-${r.ssid}`}
                    >
                      <Feather name="trash-2" size={12} color="#64748b" />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Scanning is how a new network is found — the phone's own "refresh".
          U-93: when it cannot work, it SAYS why (the owner's "router select
          not working sometime" — a silently dead button reads as a bug). */}
      <View className="mt-1.5 flex-row gap-1.5">
        <Pressable
          onPress={onScan}
          disabled={busy || !reachable}
          accessibilityRole="button"
          accessibilityLabel="Search for networks"
          className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 ${busy ? "opacity-50" : ""}`}
          testID="wifi-scan"
        >
          <Feather name="refresh-cw" size={12} color="#1e3a8a" />
          <Text className="text-[11px] font-bold text-navy">
            {busy
              ? "Searching…"
              : reachable
                ? "Search for networks"
                : "Connect to the car to search"}
          </Text>
        </Pressable>
        {busy && (
          <Pressable
            onPress={() => sendCmd("ROUTERS;SCAN;CANCEL")}
            accessibilityRole="button"
            accessibilityLabel="Cancel scan"
            className="items-center rounded-lg border border-line bg-card px-3 py-1.5"
            testID="wifi-scan-cancel"
          >
            <Text className="text-[11px] font-bold text-navy">Cancel</Text>
          </Pressable>
        )}
      </View>

      {manage ? (
        <>
          {adding ? null : (
            <Pressable
              onPress={() => setAdding(true)}
              disabled={!canAdd || !reachable}
              accessibilityRole="button"
              accessibilityLabel="Add network"
              className="mt-1.5 flex-row items-center justify-center gap-1.5 py-1"
              testID="wifi-add-open"
            >
              <Feather name="plus" size={12} color="#1e3a8a" />
              <Text className="text-[11px] font-bold text-navy">
                Add network
              </Text>
            </Pressable>
          )}

          {/* U-121 Phase C: the add/edit form is a CENTERED MODAL CARD —
              labelled, readable fields at real size, clear of the landscape
              keyboard. Same state machine, same testIDs, same submit rules. */}
          <Modal
            transparent

            visible={adding}
            animationType="fade"
            onRequestClose={cancel}
            statusBarTranslucent
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)" }}
            >
              {" "}
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  padding: 20,
                  paddingBottom: 30,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View
                  className="w-full self-center rounded-2xl border border-line bg-card p-4 shadow-2xl"
                  style={{ maxWidth: ADD_FORM_MAX_WIDTH }}
                  testID="wifi-add-form"
                >
                  <View className="flex-row items-center gap-2">
                    <Feather
                      name={editingSsid ? "edit-2" : "wifi"}
                      size={16}
                      color="#1e3a8a"
                    />
                    <Text
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-[12px] font-black text-ink"
                    >
                      {editingSsid ? "Edit network" : "Add network"}
                    </Text>
                    <Pressable
                      onPress={cancel}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      testID="wifi-add-close"
                    >
                      <Feather name="x" size={20} color="#64748b" />
                    </Pressable>
                  </View>
                  {editingSsid ? (
                    <Text
                      className="mt-1 text-[12px] leading-4 text-muted"
                      testID="wifi-edit-title"
                    >
                      “{editingSsid}” keeps its name — the car gets the new
                      password.
                    </Text>
                  ) : null}

                  {/* U-124 ⑮: the field label rendered TWICE (two identical
                      Text blocks stacked) and both at 13 px black caps — a
                      label tier louder than the form's own title. One label,
                      on the 10 px micro-label tier the rest of the panel
                      uses; the input itself stays 16 px (native keyboard
                      scaling). */}
                  <Text className="mt-5 text-[10px] font-black uppercase tracking-widest text-muted">
                    Network name
                  </Text>
                  <TextInput
                    value={ssid}
                    onChangeText={(v) => {
                      setSsid(v);
                      setError(null);
                    }}
                    onFocus={() => onInputFocus?.()}
                    placeholder="e.g. HomeNet"
                    placeholderTextColor="#94a3b8"
                    selectionColor="#1e3a8a"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Network name"
                    maxLength={40}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passRef.current?.focus()}
                    className="mt-2 h-14 rounded-lg border-2 border-line bg-surface px-4 text-[16px] text-ink"
                    testID="wifi-ssid"
                  />
                  <Text className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    Password
                  </Text>
                  <TextInput
                    ref={passRef}
                    value={pass}
                    onChangeText={(v) => {
                      setPass(v);
                      setError(null);
                    }}
                    onFocus={() => onInputFocus?.()}
                    placeholder="Wi-Fi password"
                    placeholderTextColor="#94a3b8"
                    selectionColor="#1e3a8a"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    accessibilityLabel="Network password"
                    maxLength={128}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    className="mt-2 h-16 rounded-lg border-2 border-line bg-surface px-4 text-[16px] text-ink"
                    testID="wifi-pass"
                  />
                  {error ? (
                    <InlineMessage tone="error">{error}</InlineMessage>
                  ) : null}

                  <View className="mt-6 flex-row gap-2">
                    <Pressable
                      onPress={submit}
                      disabled={
                        busy ||
                        !ssid.trim() ||
                        (editingSsid != null && !pass.trim())
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Save network"
                      className="flex-1 items-center rounded-full bg-navy py-4 disabled:opacity-50"
                      testID="wifi-add-submit"
                    >
                      <Text className="text-[14px] font-black text-white">
                        {editingSsid ? "Save password" : "Save"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={cancel}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                      className="items-center rounded-full border-2 border-line bg-card px-6 py-4"
                    >
                      <Text className="text-[14px] font-bold text-navy">
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Modal>
        </>
      ) : (
        /* Reduced mode (owner 2026-10-11): the list stays here for connecting
           and switching; add/edit/delete moved to the Remote screen's Router
           panel, so this copy points there instead of re-rendering a second
           manager. One short line, no paragraph. */
        <View className="mt-1.5 rounded-md border border-line bg-card px-2 py-1">
          <Text className="text-[10px] leading-3 text-muted">
            Add, edit and forget networks from the Remote screen (Router).
          </Text>
        </View>
      )}
    </View>
  );
}
