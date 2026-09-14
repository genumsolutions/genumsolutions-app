// =====================================================================
// WeblinkControls — deck card for the multimode wireless-car packages
// (Website-Server / Website-Client, tokens ESP_SER / ESP_CLI) in the
// per-package Car Remote.
//
// Grounded in Genum_WIRELESS_CAR_V1.0.0 (the multimode WiFi car):
//   - ESP_SER: the car hosts its own control page (HTTP :80) + a
//     WebSocket (:81). It tries to join the configured WiFi first and
//     falls back to its own AP (192.168.4.1) — join it, then connect the
//     app to ws://192.168.4.1:81.
//   - ESP_CLI: the car is the WiFi *client* — a browser/website acts as
//     the control server (the phone app cannot be the server), so the
//     app connects directly only in ESP_SER / AP mode.
//   - The car broadcasts its live status over the WS as JSON
//     ({status, mode, ip, rssi, signal, uptime_ms, free_heap, speed}),
//     which carProtocol now parses into telemetry.
// =====================================================================
import React, { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, Vibration } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { ActivityIndicator } from 'react-native'
import type { WeblinkControlsProps } from './types'

export function WeblinkControls({
  canControl, wifiConnected, activeMode, telemetry,
  onOpenWebPage, onEnterMode,
  // v1.4.0 WiFi provisioning (optional — only the Remote window passes these)
  btConnected = false, wifiSsid, setWifiSsid, wifiPassword, setWifiPassword,
  wifiProvisioning = false, onProvisionWifi, carApName, carSsid,
}: WeblinkControlsProps) {
  const isServer = activeMode.id === 'website-server'
  const hasStatus = wifiConnected && Boolean(telemetry.mode || telemetry.status)
  const [showPass, setShowPass] = useState(false)
  const provisionable = isServer && onProvisionWifi != null
  // A-8: the provisioning card defaults OPEN only when it can be used right
  // now (BT connected in ESP_SER); otherwise it stays collapsed to its header
  // row so the deck fits — the owner's "measure the space and fit them"
  // requirement. Auto-expands the moment the BT link comes up.
  const [cardOpen, setCardOpen] = useState<boolean>(() => Boolean(btConnected && provisionable))
  useEffect(() => {
    if (btConnected) setCardOpen(true)
  }, [btConnected])
  // A-8 measurement: record the card's real laid-out size (dev log feeds the
  // TESTING.md R11-4 "measured deck budget" note).
  const [cardSize, setCardSize] = useState<{ w: number; h: number } | null>(null)
  const passRef = useRef<TextInput | null>(null)

  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      {/* Header + mode entry */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Feather name="globe" size={14} color="#1e3a8a" />
            <Text className="text-xs font-black uppercase tracking-widest text-navy">
              Weblink · {activeMode.token}
            </Text>
          </View>
          <Text className="mt-1 text-[11px] leading-4 text-muted">
            {isServer
              ? 'The car hosts its own page (HTTP :80) and a WebSocket (:81). It joins the configured WiFi, or makes its own AP at 192.168.4.1 when that fails.'
              : 'The car is the WiFi client — a browser / the website /tools deck acts as the control server. The app connects directly only in ESP_SER (AP) mode.'}
          </Text>
        </View>
        <Pressable
          onPress={onEnterMode}
          disabled={!canControl}
          className="shrink-0 items-center rounded-full bg-navy px-4 py-2 disabled:opacity-60"
        >
          <Text className="text-xs font-black text-white">Enter {activeMode.token}</Text>
        </Pressable>
      </View>

      {/* Open the car's own web UI (ESP_SER hosts PAGE_HTML on port 80) */}
      <Pressable
        onPress={onOpenWebPage}
        disabled={!wifiConnected || !isServer}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-full bg-navy px-6 py-3 disabled:opacity-60"
      >
        <Feather name="external-link" size={14} color="#fff" />
        <Text className="text-sm font-black text-white">
          {wifiConnected && isServer ? 'Open car web page' : isServer ? 'Connect over WiFi to open the car page' : 'Use the website /tools as the server'}
        </Text>
      </Pressable>

      {/* Live JSON status from the WS link */}
      <View className="mt-4 rounded-xl bg-slate-900 px-4 py-3 shadow-inner">
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-xs font-bold uppercase tracking-wide text-slate-500">
            Car status (WS)
          </Text>
          <View className="flex-row items-center gap-1.5">
            <View className={`h-2 w-2 rounded-full ${wifiConnected ? 'bg-emerald-500' : 'bg-border'}`} />
            <Text className={`text-[10px] font-black uppercase tracking-wide ${wifiConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {wifiConnected ? 'LINK' : 'NO LINK'}
            </Text>
          </View>
        </View>
        {hasStatus ? (
          <View className="mt-1.5 flex-row flex-wrap items-end gap-x-4">
            {telemetry.mode != null && (
              <Text className="font-mono text-sm font-bold text-emerald-300">M:{telemetry.mode}</Text>
            )}
            {telemetry.status != null && (
              <Text className="font-mono text-sm text-emerald-300">{telemetry.status}</Text>
            )}
            {telemetry.speed != null && (
              <Text className="font-mono text-sm text-emerald-300">SPD {telemetry.speed}</Text>
            )}
            {telemetry.rssi != null && (
              <Text className="font-mono text-sm text-slate-400">RSSI {telemetry.rssi} dBm</Text>
            )}
            {telemetry.ip != null && (
              <Text className="font-mono text-sm text-slate-400">{telemetry.ip}</Text>
            )}
          </View>
        ) : (
          <Text className="mt-1.5 font-mono text-sm text-slate-500">
            {wifiConnected ? 'Waiting for the car’s status…' : '—'}
          </Text>
        )}
      </View>

      {/* ── v1.4.0 / A-8 WiFi provisioning (ESP_SER only): send SSID/password over BT.
          Collapsible + compact so the card fits the deck without scrolling
          (owner: "measure the available space and fit them properly"). ── */}
      {provisionable && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="mt-4"
        >
          <View
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout
              setCardSize((prev) => {
                if (prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) return prev
                if (__DEV__) {
                  console.log(`[A-8] WiFi card measured: ${Math.round(width)}x${Math.round(height)} (deck ESP_SER, open=${cardOpen})`)
                }
                return { w: width, h: height }
              })
            }}
            className="rounded-xl border border-navy/20 bg-navy/5 px-4 py-3"
          >
            {/* Header doubles as the collapse toggle */}
            <Pressable
              onPress={() => { Vibration.vibrate(10); setCardOpen((v) => !v) }}
              accessibilityRole="button"
              accessibilityLabel={cardOpen ? 'Collapse WiFi setup' : 'Expand WiFi setup'}
              className="flex-row items-center gap-2"
            >
              <Feather name="share" size={13} color="#1e3a8a" />
              <Text className="flex-1 text-xs font-black uppercase tracking-widest text-navy">
                WiFi setup · send to car
              </Text>
              {!cardOpen && (carSsid || carApName) ? (
                <Text className="max-w-[45%] flex-1 text-right text-[10px] font-bold text-navy/70" numberOfLines={1} ellipsizeMode="middle">
                  {carSsid ? `Car WiFi: ${carSsid}` : `AP: ${carApName}`}
                </Text>
              ) : null}
              <Feather name={cardOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#1e3a8a" />
            </Pressable>

            {cardOpen && (
              <>
                <Text className="mt-1 text-[11px] leading-4 text-muted" numberOfLines={1}>
                  Sends your router credentials to the car over Bluetooth — saved on the car, survives power cycles.
                </Text>
                <TextInput
                  value={wifiSsid}
                  onChangeText={setWifiSsid}
                  editable={!wifiProvisioning}
                  placeholder="WiFi name (SSID)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passRef.current?.focus()}
                  blurOnSubmit={false}
                  className="mt-2 h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                />
                <View className="mt-2 flex-row items-center gap-2">
                  <TextInput
                    ref={passRef}
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    editable={!wifiProvisioning}
                    placeholder="WiFi password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPass}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (btConnected && !wifiProvisioning && (wifiSsid ?? '').trim()) onProvisionWifi?.()
                    }}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
                  />
                  <Pressable
                    onPress={() => setShowPass((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
                    className="h-10 justify-center rounded-lg border border-line bg-surface px-2.5"
                  >
                    <Feather name={showPass ? 'eye-off' : 'eye'} size={14} color="#1e3a8a" />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => { Vibration.vibrate(10); onProvisionWifi?.() }}
                  disabled={!btConnected || wifiProvisioning || !(wifiSsid ?? '').trim()}
                  className="mt-2.5 h-10 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 disabled:opacity-50"
                >
                  {wifiProvisioning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="upload" size={14} color="#fff" />
                  )}
                  <Text className="text-xs font-black text-white">
                    {!btConnected
                      ? 'Connect car over Bluetooth first'
                      : wifiProvisioning ? 'Sending to car…'
                      : 'Send WiFi to car'}
                  </Text>
                </Pressable>
                {(carSsid || carApName) && (
                  <View className="mt-2 flex-row items-center gap-3">
                    {carSsid ? (
                      <Text className="min-w-0 flex-1 text-[11px] font-bold text-navy" numberOfLines={1} ellipsizeMode="middle">
                        Car WiFi: {carSsid}
                      </Text>
                    ) : null}
                    {carApName ? (
                      <Text className="min-w-0 flex-1 text-[11px] font-bold text-navy" numberOfLines={1} ellipsizeMode="middle">
                        Fallback AP: {carApName}
                      </Text>
                    ) : null}
                  </View>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      <Text className="mt-3 text-[11px] leading-4 text-muted">
        Driving below works over the same link — direction letters and SPD go to the car’s
        WebSocket, exactly like the web page’s own buttons.
      </Text>
    </View>
  )
}