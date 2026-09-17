// =====================================================================
// RouterPanel — the ONE "WiFi & Router" panel of the game-remote deck
// (device-round-5, A-26/A-27/A-28).
//
// Shown when the drive pads are HIDDEN (ESP_SER / website-server modes
// only — round-6: other hidden modes show the "Pad hidden" placeholder).
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
// A-28 keyboard safety: the Add form sits in a KeyboardAvoidingView +
// ScrollView with keyboardShouldPersistTaps="handled" so the SSID /
// password inputs always scroll above the keyboard on a phone.
//
// Round-6 skin: fully theme-token based (dark: exact replacements for the
// previous hard-wired slate-900/white text), legible 10-12px type, and the
// footer text now ships REAL characters (em dash / apostrophe) instead of
// literal \u2014 / &apos; escapes that used to render verbatim.
// =====================================================================
import React from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { RouterPanelProps } from './types'
import { OWN_AP_NAME } from '../../services/carProtocol'

export function RouterPanel({
  canControl, linked, carSsid, carApName, ip,
  networks, onUse, onAdd, onDelete, onClear, onOpenWebPage,
}: RouterPanelProps) {
  const [ssid, setSsid] = React.useState('')
  const [pass, setPass] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const activeName = carSsid ?? carApName ?? null
  const ipOut = ip || (linked ? '192.168.4.1' : null)

  // A-46 (round-9): the car's OWN network is pinned as a non-deletable
  // Default row and never enters the saved-list delete/switch path.
  const userNetworks = networks.filter((n) => n !== OWN_AP_NAME)

  const confirmClearAll = () => {
    // A-42: destructive — confirm before wiping every saved router (car NVS +
    // remote cache); the clear itself only ever references the own network as
    // the protected default (car T-62/T-66).
    Alert.alert(
      'Clear all routers?',
      `Removes every saved router from the car and the remote. The car keeps only its own ${OWN_AP_NAME} as the default.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: () => { if (!busy) onClear() } },
      ],
    )
  }

  const handleDelete = (name: string) => {
    if (name === OWN_AP_NAME) return
    onDelete(name)
  }

  const handleAdd = () => {
    const s = ssid.trim()
    if (!s || busy) return
    setBusy(true)
    onAdd(s, pass)
    setSsid('')
    setPass('')
    setTimeout(() => setBusy(false), 600)
  }

  // A-35/A-39: landscape split-card grid — three cards share the row. A-39
  // (device-round-8): the card width is a FIXED PIXEL value measured from the
  // panel on layout (`(available − 2 gaps) / 3`, clamped 260–380) instead of a
  // `46%` percentage, which mis-measured inside a horizontal ScrollView and
  // stretched/overflowed the cards (last card unreachable). `shrink-0` keeps
  // them from compressing; narrow screens still scroll horizontally.
  const GAP = 12
  // A-51 (round-11): the outer vertical ScrollView pads 6px per side, so the
  // card row measures (panel width − 12). Width stays per-card FIXED pixel
  // (clamped 260–380) so the row scrolls horizontally on narrow screens.
  const PANEL_PAD = 12
  const [availW, setAvailW] = React.useState(0)
  const cardWidth = React.useMemo(() => {
    const usable = Math.max(0, availW - PANEL_PAD)
    const per = (usable - GAP * 2) / 3
    return { width: Math.max(260, Math.min(380, per)) } as const
  }, [availW])

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      className="min-h-0"
    >
      {/* Header */}
      <View className="flex-row items-center gap-2 px-1 pt-1">
        <Feather name="wifi" size={15} color="#1e3a8a" />
        <Text className="text-[13px] font-black uppercase tracking-widest text-navy">WiFi &amp; Router</Text>
        <View className="ml-auto flex-row items-center gap-1">
          <View className={`h-2.5 w-2.5 rounded-full ${linked ? 'bg-emerald-500' : 'bg-border'}`} />
          <Text className={`text-[11px] font-black uppercase tracking-wide ${linked ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>
            {linked ? 'LINK' : 'NO LINK'}
          </Text>
        </View>
      </View>

      {/* A-51 (round-11): the panel CLIPS to its rounded box (overflow-hidden)
          so the tall Add card no longer spills past the rounded corners, and
          the row scrolls VERTICALLY when the landscape deck is shorter than
          the cards — the W-14 note used to render outside the box edge. */}
      <View className="mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <ScrollView
          className="min-h-0 flex-1"
          contentContainerStyle={{ padding: 6 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
        <ScrollView
          horizontal
          onLayout={(e) => setAvailW(e.nativeEvent.layout.width)}
          contentContainerStyle={{ gap: GAP }}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
        >
        {/* A-35b · Card: active connection + IP (tappable → web page) */}
        <View style={cardWidth} className="shrink-0 rounded-xl bg-mist px-3 py-3 shadow-inner dark:bg-mist">
          <Text className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Active connection</Text>
          <Text className="mt-1 text-[15px] font-bold text-ink dark:text-white" numberOfLines={1} ellipsizeMode="middle">
            {activeName ?? (linked ? 'Default router' : '\u2014')}
          </Text>
          {activeName && carApName && (carApName !== carSsid) ? (
            <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1} ellipsizeMode="middle">
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
              <Feather name={linked ? 'external-link' : 'wifi'} size={13} color={linked ? '#0284c7' : '#64748b'} />
              <Text className={`font-mono text-[13px] ${linked ? 'text-sky-700 underline dark:text-sky-300' : 'text-muted'}`} numberOfLines={1}>
                {ipOut}{!ip ? ' (AP fallback)' : ''}
              </Text>
            </Pressable>
          ) : null}
          <Text className="mt-2 text-[12px] leading-4 text-muted">
            The car's own hosted page — open it in a browser to drive from any phone on the network.
          </Text>
        </View>

        {/* Card: saved routers — own network pinned as Default (A-46) */}
        <View style={cardWidth} className="shrink-0 rounded-xl border border-line bg-mist p-3 dark:bg-mist">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-wide text-muted" numberOfLines={1}>
              Saved on the car{userNetworks.length > 0 ? ` \u00b7 ${userNetworks.length}/6` : ''}
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
                <Text className="text-[10px] font-black uppercase tracking-wide text-red-600 dark:text-red-400">Clear all</Text>
              </Pressable>
            )}
          </View>

          {/* Pinned Default row — the car's OWN network (T-66): never deletable,
              no Switch (it IS the fallback network). */}
          <View className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/10 px-2.5 py-2">
            <Feather name="wifi" size={12} color="#0284c7" />
            <Text className="min-w-0 flex-1 text-[13px] font-bold text-ink dark:text-white" numberOfLines={1} ellipsizeMode="middle">
              {OWN_AP_NAME}
            </Text>
            <Text className="shrink-0 text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">Default</Text>
          </View>

          {userNetworks.length === 0 ? (
            <Text className="mt-1 text-[13px] leading-5 text-muted">
              No saved routers yet. Add one in the next card to switch the car between networks from here.
            </Text>
          ) : (
            userNetworks.map((n) => (
              <View
                key={n}
                className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2"
              >
                <Feather name="wifi" size={12} color={n === carSsid ? '#059669' : '#64748b'} />
                <Text
                  className="min-w-0 flex-1 text-[13px] font-bold text-ink dark:text-white"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {n}
                </Text>
                {n === carSsid ? (
                  <Text className="shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active</Text>
                ) : (
                  <Pressable
                    onPress={() => onUse(n)}
                    disabled={!linked}
                    accessibilityRole="button"
                    accessibilityLabel={`Switch the car to ${n}`}
                    hitSlop={6}
                    className="rounded-full border border-sky-500/50 bg-sky-500/15 px-2.5 py-1.5 disabled:opacity-40"
                  >
                    <Text className="text-[11px] font-black text-sky-700 dark:text-sky-300">Switch</Text>
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
                  <Text className="text-[11px] font-black text-muted">Delete</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* Card: add form */}
        <View style={cardWidth} className="shrink-0 rounded-xl border border-line bg-mist p-3 dark:bg-mist">
          <Text className="text-[11px] font-black uppercase tracking-wide text-muted">Add a router</Text>
          <TextInput
            value={ssid}
            onChangeText={setSsid}
            editable={!busy}
            placeholder="WiFi name (SSID)"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            blurOnSubmit={false}
            className="mt-1.5 h-12 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
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
            className="mt-2 h-12 rounded-lg border border-line bg-card px-3 text-[14px] text-ink dark:text-white"
            placeholderTextColor="#64748b"
          />
          <Pressable
            onPress={handleAdd}
            disabled={busy || !ssid.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add this router to the car"
            className="mt-2 h-12 flex-row items-center justify-center gap-1.5 rounded-full bg-sky-700 disabled:opacity-50"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="plus" size={14} color="#fff" />
            )}
            <Text className="text-[13px] font-black text-white">{busy ? 'Saving…' : 'Add + switch'}</Text>
          </Pressable>
          <Text className="mt-2 text-[11px] leading-4 text-muted">
            Sent over the live link and stored on the car's NVS. Passwords never leave the car after saving — they are the car's own secret (W-14).
          </Text>
          {!canControl && (
            <Text className="mt-2 text-[11px] leading-4 text-muted">Connect the car to manage routers.</Text>
          )}
        </View>
      </ScrollView>
      </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}