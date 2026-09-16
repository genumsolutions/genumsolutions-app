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
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { WeblinkControlsProps } from './types'

/** Format a `uptime_ms` value into a compact hh:mm:ss or mm:ss string. */
function formatUptime(ms?: number): string {
  if (ms == null || ms < 0) return '\u2014'
  const secs = Math.floor(ms / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function WeblinkControls({
  wifiConnected, activeMode, telemetry,
  onOpenWebPage,
}: WeblinkControlsProps) {
  const isServer = activeMode.id === 'website-server'
  const hasStatus = wifiConnected && Boolean(telemetry.mode || telemetry.status)

  // Root is a bounded ScrollView (flex-1) so the card NEVER overflows the
  // remote deck in landscape when the provisioning card auto-expands (btConnected)
  // \u2014 the deck scrolls instead (owner "measure the space and fit them" fix).
  return (
    <ScrollView
      className="mt-4 min-h-0 flex-1 rounded-2xl border border-line bg-card p-5 shadow-card"
      contentContainerStyle={{ paddingBottom: 8 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
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
              : 'The car is the WiFi client \u2014 a browser / the website /tools deck acts as the control server. The app connects directly only in ESP_SER (AP) mode.'}
          </Text>
        </View>
        {/* A-12 (device-round-2): this deck only renders for the ALREADY-ACTIVE
            weblink mode, so an "Enter ESP_SER" claim was a dead no-op (owner
            report: "the button does nothing"). Passive hint instead. */}
        <View className="shrink-0 items-center rounded-full border border-navy/20 bg-navy/5 px-4 py-2">
          <Text className="text-xs font-black text-navy">Mode active · drive below</Text>
        </View>
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

      {/* Live telemetry deck \u2014 structured rows from the car's WS JSON
          (ip, rssi, signal, uptime_ms, free_heap).  IP is tappable to
          open the car's hosted page (ESP_SER only). */}
      <View className="mt-4 rounded-xl bg-slate-900 px-4 py-3 shadow-inner">
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-xs font-bold uppercase tracking-wide text-slate-500">
            Live telemetry · {activeMode.token}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <View className={`h-2 w-2 rounded-full ${wifiConnected ? 'bg-emerald-500' : 'bg-border'}`} />
            <Text className={`text-[10px] font-black uppercase tracking-wide ${wifiConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {wifiConnected ? 'LINK' : 'NO LINK'}
            </Text>
          </View>
        </View>

        {hasStatus ? (
          <View className="mt-2 gap-1.5">
            {/* Row 1: Mode + Status */}
            <View className="flex-row items-center gap-3">
              {telemetry.mode != null && (
                <Text className="font-mono text-xs font-bold text-emerald-300">
                  MODE:{telemetry.mode}
                </Text>
              )}
              {telemetry.status != null && (
                <Text className="font-mono text-xs text-emerald-300">
                  {telemetry.status}
                </Text>
              )}
            </View>

            {/* Row 2: Speed */}
            {telemetry.speed != null && (
              <View className="flex-row items-center gap-3">
                <Text className="font-mono text-xs text-emerald-300">
                  SPD:{telemetry.speed}
                </Text>
              </View>
            )}

            {/* Row 3: RSSI + Signal */}
            {(telemetry.rssi != null || telemetry.signal != null) && (
              <View className="flex-row items-center gap-3">
                {telemetry.rssi != null && (
                  <Text className="font-mono text-[11px] text-slate-400">
                    RSSI:{telemetry.rssi}dBm
                  </Text>
                )}
                {telemetry.signal != null && (
                  <Text className="font-mono text-[11px] text-slate-400">
                    SIG:{telemetry.signal}%
                  </Text>
                )}
              </View>
            )}

            {/* A-11 (device-round-2): the ESP_SER IP row renders ALWAYS when this
            deck shows the website-server package — even before the WebSocket
            connects — so the broadcast IP is never hidden just when you need
            it. Value = live `telemetry.ip` else the AP fallback 192.168.4.1. */}
        {isServer && (
          <Pressable
            onPress={() => { if (wifiConnected && isServer) onOpenWebPage() }}
            disabled={!wifiConnected || !isServer}
            className="flex-row items-center gap-1.5"
          >
            <Feather
              name={wifiConnected && isServer ? 'external-link' : 'wifi'}
              size={11}
              color={wifiConnected && isServer ? '#93c5fd' : '#64748b'}
            />
            <Text
              className={`font-mono text-[11px] ${wifiConnected && isServer ? 'text-sky-300 underline' : 'text-slate-500'}`}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              http://{telemetry.ip || '192.168.4.1'}{!telemetry.ip ? ' (AP fallback)' : ''}
            </Text>
          </Pressable>
        )}

            {/* Row 5: Uptime + Free heap */}
            {(telemetry.uptimeMs != null || telemetry.freeHeap != null) && (
              <View className="flex-row items-center gap-3">
                {telemetry.uptimeMs != null && (
                  <Text className="font-mono text-[10px] text-slate-500">
                    UP:{formatUptime(telemetry.uptimeMs)}
                  </Text>
                )}
                {telemetry.freeHeap != null && (
                  <Text className="font-mono text-[10px] text-slate-500">
                    HEAP:{Math.round(telemetry.freeHeap / 1024)}KB
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : (
          <Text className="mt-2 font-mono text-sm text-slate-500">
            {wifiConnected ? "Waiting for the car\u2019s status\u2026" : '\u2014'}
          </Text>
        )}
      </View>

      {/* A-20: WiFi provisioning moved to RemoteControlScreen Settings dropdown */}

      <Text className="mt-3 text-[11px] leading-4 text-muted">
        Driving below works over the same link — direction letters and SPD go to the car&apos;s
        WebSocket, exactly like the web page&apos;s own buttons.
      </Text>
    </ScrollView>
  )
}
