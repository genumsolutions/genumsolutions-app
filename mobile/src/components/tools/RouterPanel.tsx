// =====================================================================
// RouterPanel — the ONE "WiFi & Router" panel of the game-remote deck
// (device-round-5, A-26/A-27/A-28).
//
// Shown when the drive pads are HIDDEN. Replaces the retired Settings
// WiFi card, the WeblinkControls card and the "Pad hidden" placeholder.
// It renders:
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      className="min-h-0"
    >
      <ScrollView
        className="mt-2 min-h-0 flex-1 rounded-2xl border border-line bg-card p-3 shadow-card"
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center gap-2">
          <Feather name="wifi" size={14} color="#1e3a8a" />
          <Text className="text-xs font-black uppercase tracking-widest text-navy">WiFi &amp; Router</Text>
          <View className="ml-auto flex-row items-center gap-1">
            <View className={`h-2 w-2 rounded-full ${linked ? 'bg-emerald-500' : 'bg-border'}`} />
            <Text className={`text-[10px] font-black uppercase tracking-wide ${linked ? 'text-emerald-400' : 'text-slate-500'}`}>
              {linked ? 'LINK' : 'NO LINK'}
            </Text>
          </View>
        </View>

        {/* Active connection + IP (tappable → web page) */}
        <View className="mt-2 rounded-xl bg-slate-900 px-3 py-2.5 shadow-inner">
          <Text className="font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">Active</Text>
          <Text className="mt-0.5 text-[13px] font-bold" numberOfLines={1} ellipsizeMode="middle">
            {activeName ?? (linked ? 'Default router' : '\u2014')}
          </Text>
          {activeName && carApName && (carApName !== carSsid) ? (
            <Text className="text-[10px] text-slate-400" numberOfLines={1}>
              AP: {carApName}
            </Text>
          ) : null}
          {ipOut ? (
            <Pressable
              onPress={onOpenWebPage}
              disabled={!linked}
              accessibilityRole="link"
              accessibilityLabel={`Open car web page at ${ipOut}`}
              hitSlop={4}
              className="mt-1 flex-row items-center gap-1.5"
            >
              <Feather name={linked ? 'external-link' : 'wifi'} size={11} color={linked ? '#93c5fd' : '#64748b'} />
              <Text className={`font-mono text-[11px] ${linked ? 'text-sky-300 underline' : 'text-slate-500'}`} numberOfLines={1}>
                {ipOut}{!ip ? ' (AP fallback)' : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Saved routers */}
        <Text className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
          Saved on the car
          {networks.length > 0 ? ` \u00b7 ${networks.length}${networks.length >= 6 ? '/6' : ''}` : ''}
        </Text>
        {networks.length === 0 ? (
          <Text className="mt-1 text-[11px] leading-4 text-muted">
            No saved routers yet. Add one below to switch the car between networks from here.
          </Text>
        ) : (
          networks.map((n) => (
            <View
              key={n}
              className="mt-1.5 flex-row items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"
            >
              <Feather name="wifi" size={11} color={n === carSsid ? '#34d399' : '#64748b'} />
              <Text
                className="min-w-0 flex-1 text-[12px] font-bold"
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {n}
              </Text>
              {n === carSsid ? (
                <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Active</Text>
              ) : (
                <Pressable
                  onPress={() => onUse(n)}
                  disabled={!linked}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch the car to ${n}`}
                  hitSlop={6}
                  className="rounded-full border border-sky-500/40 bg-sky-700/20 px-2.5 py-1 disabled:opacity-40"
                >
                  <Text className="text-[10px] font-black text-sky-300">Switch</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => onDelete(n)}
                disabled={!linked}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${n} from the car`}
                hitSlop={6}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 disabled:opacity-40"
              >
                <Text className="text-[10px] font-black text-slate-400">Delete</Text>
              </Pressable>
            </View>
          ))
        )}

        {/* Add form */}
        <Text className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-500">Add a router</Text>
        <TextInput
          value={ssid}
          onChangeText={setSsid}
          editable={!busy}
          placeholder="WiFi name (SSID)"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          blurOnSubmit={false}
          className="mt-1.5 h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[12px] text-white"
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
          className="mt-1 h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[12px] text-white"
          placeholderTextColor="#64748b"
        />
        <Pressable
          onPress={handleAdd}
          disabled={busy || !ssid.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add this router to the car"
          className="mt-1.5 h-9 flex-row items-center justify-center gap-1.5 rounded-full bg-sky-700 disabled:opacity-50"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="plus" size={12} color="#fff" />
          )}
          <Text className="text-[10px] font-black text-white">{busy ? 'Saving…' : 'Add + switch'}</Text>
        </Pressable>
        <Text className="mt-2 text-[9px] leading-3 text-slate-500">
          Sent to the car over the live link and saved on the car. Passwords never leave the car after
          saving \u2014 they are the car&apos;s own secret (W-14).
        </Text>
        {!canControl && (
          <Text className="mt-2 text-[9px] leading-3 text-slate-500">Connect the car to manage routers.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}