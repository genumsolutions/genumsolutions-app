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
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { RouterPanelProps } from './types'

export function RouterPanel({
  canControl, linked, carSsid, carApName, ip,
  networks, onUse, onAdd, onDelete, onOpenWebPage,
}: RouterPanelProps) {
  const [ssid, setSsid] = React.useState('')
  const [pass, setPass] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const activeName = carSsid ?? carApName ?? null
  const ipOut = ip || (linked ? '192.168.4.1' : null)

  const handleAdd = () => {
    const s = ssid.trim()
    if (!s || busy) return
    setBusy(true)
    onAdd(s, pass)
    setSsid('')
    setPass('')
    setTimeout(() => setBusy(false), 600)
  }

  // A-35: landscape split-card grid — the panel is a horizontal ScrollView of
  // min-width ~300 px cards (active connection | saved routers | add router),
  // so on a wide landscape deck they sit side-by-side and on a narrow screen
  // they scroll instead of squeezing. Bigger touch targets (h-12) + 13–14 px
  // type. A-35b: the car's own WiFi (SSID/AP/IP) is its own card.
  const cardWidth = { width: '46%', minWidth: 300 } as const

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

      <ScrollView
        horizontal
        className="mt-2 min-h-0 rounded-2xl border border-line bg-card p-3 shadow-card"
        contentContainerStyle={{ gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {/* A-35b · Card: active connection + IP (tappable → web page) */}
        <View style={cardWidth} className="shrink-0 rounded-xl bg-mist px-3 py-3 shadow-inner dark:bg-slate-900">
          <Text className="font-mono text-[11px] font-bold uppercase tracking-wide text-muted">Active connection</Text>
          <Text className="mt-1 text-[15px] font-bold text-ink dark:text-white" numberOfLines={1} ellipsizeMode="middle">
            {activeName ?? (linked ? 'Default router' : '\u2014')}
          </Text>
          {activeName && carApName && (carApName !== carSsid) ? (
            <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1}>
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

        {/* Card: saved routers */}
        <View style={cardWidth} className="shrink-0 rounded-xl border border-line bg-mist p-3 dark:bg-slate-900">
          <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
            Saved on the car
            {networks.length > 0 ? ` \u00b7 ${networks.length}${networks.length >= 6 ? '/6' : ''}` : ''}
          </Text>
          {networks.length === 0 ? (
            <Text className="mt-1 text-[13px] leading-5 text-muted">
              No saved routers yet. Add one in the next card to switch the car between networks from here.
            </Text>
          ) : (
            networks.map((n) => (
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
                  <Text className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active</Text>
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
                  onPress={() => onDelete(n)}
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
        <View style={cardWidth} className="shrink-0 rounded-xl border border-line bg-mist p-3 dark:bg-slate-900">
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
    </KeyboardAvoidingView>
  )
}