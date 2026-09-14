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
import React, { useState } from 'react'
import { Pressable, Text, TextInput, View, Vibration } from 'react-native'
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

      {/* ── v1.4.0 WiFi provisioning (ESP_SER only): send SSID/password over BT ── */}
      {provisionable && (
        <View className="mt-4 rounded-xl border border-navy/20 bg-navy/5 px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Feather name="share" size={13} color="#1e3a8a" />
            <Text className="text-xs font-black uppercase tracking-widest text-navy">
              WiFi setup · send to car
            </Text>
          </View>
          <Text className="mt-1 text-[11px] leading-4 text-muted">
            Connect the car over Bluetooth first, then send your router’s name and
            password. The car saves them, joins the WiFi and hosts its web page —
            no re-flashing needed.
          </Text>
          <TextInput
            value={wifiSsid}
            onChangeText={setWifiSsid}
            editable={!wifiProvisioning}
            placeholder="WiFi name (SSID)"
            autoCapitalize="none"
            autoCorrect={false}
            className="mt-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <View className="mt-2 flex-row items-center gap-2">
            <TextInput
              value={wifiPassword}
              onChangeText={setWifiPassword}
              editable={!wifiProvisioning}
              placeholder="WiFi password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPass}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
            <Pressable
              onPress={() => setShowPass((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
              className="rounded-lg border border-line bg-surface px-2.5 py-2"
            >
              <Feather name={showPass ? 'eye-off' : 'eye'} size={14} color="#1e3a8a" />
            </Pressable>
          </View>
          <Pressable
            onPress={() => { Vibration.vibrate(10); onProvisionWifi?.() }}
            disabled={!btConnected || wifiProvisioning || !(wifiSsid ?? '').trim()}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-full bg-navy px-5 py-2.5 disabled:opacity-50"
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
            <View className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1">
              {carSsid ? (
                <Text className="text-[11px] font-bold text-navy">Car WiFi: {carSsid}</Text>
              ) : null}
              {carApName ? (
                <Text className="text-[11px] font-bold text-navy">Fallback AP: {carApName}</Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      <Text className="mt-3 text-[11px] leading-4 text-muted">
        Driving below works over the same link — direction letters and SPD go to the car’s
        WebSocket, exactly like the web page’s own buttons.
      </Text>
    </View>
  )
}