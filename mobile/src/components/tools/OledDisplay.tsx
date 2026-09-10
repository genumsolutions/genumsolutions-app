// =====================================================================
// OledDisplay — pixel-faithful mirror of the ESP32 remote's 1.3" OLED
// (SH1106 128x64, U8g2), per Genum_ESP32_Remote_v1.0.0/ui.md storyboard:
//
//   ┌────────────────────────────────┐
//   │ Mode: Bluetooth | Speed: 170   │ ← Control Panel Bar (top)
//   │                                │
//   │            Forward             │ ← Body Space (mode-specific)
//   │                                │
//   │   CONNECTED / READY            │ ← Control & Status Bar (inverted)
//   └────────────────────────────────┘
//
// Top bar: `<Mode> | <value>` with a vertical separator. The value is
// Speed (100..255) for most modes and the MAX STEER LIMIT (0..180) for
// 2WD1M — the limit, never the live servo angle. In NAV mode the
// highlighted field is drawn INVERTED (filled box, text knocked out),
// exactly like u8g2 drawBox + setDrawColor(0) in ui_core.cpp.
//
// Body per mode (drawDashboard dispatch):
//   BT / 2WD1M  → big centered direction (Forward/Backward/Left/Right/Stop)
//   AUTO        → Angle row (inverted), P/D row, OUT/I/OFF row
//   other modes → centered mode title
//   preview     → previewed mode's body; unavailable modes → COMING SOON...
//
// Bottom bar: always inverted, centered, status message
// (drawBottomStatus in ui_misc.cpp — drawBox + drawColor 0).
// =====================================================================
import React from 'react'
import { Text, View } from 'react-native'
import { MODE_NAMES } from '../../config/roboCarCatalog'
import type { OledDisplayProps } from './types'

export function OledDisplay({
  connected, wifiConnected, deviceName, activeMode,
  speed, servo, driveStatus, targetAltitude, gimbalPan, gimbalTilt,
  sensorData, telemetry, isDrone, isNonRobocar, linkKind, compact = false,
  topField = 'none', previewMode = null, previewComingSoon = false, steerLimit,
}: OledDisplayProps) {
  const is2wd1m = activeMode.controls.includes('drive-2wd1m')
  const isAuto = activeMode.token === 'AUTO'
  const mono = (extra = '') => `font-mono ${extra}`

  // The mode the top bar + body currently SHOW: preview wins over active
  // (previewModeIndex on the physical remote).
  const shown = previewMode ?? activeMode
  const shownIs2wd1m = shown.controls.includes('drive-2wd1m')
  const shownIsAuto = shown.token === 'AUTO'
  const shownName = MODE_NAMES[shown.token] ?? shown.name.split('·')[0].trim()

  // Right field: Steer LIMIT in 2WD1M (the max angle the remote passes to
  // the car — never the live servo angle, ui.md 6b), Speed otherwise.
  const rightLabel = shownIs2wd1m ? 'Steer' : 'Spd'
  const rightFieldValue = shownIs2wd1m ? String(steerLimit ?? 90) : String(speed)

  const linkLabel =
    linkKind === 'spp' ? 'SPP'
      : linkKind === 'wifi' ? 'WiFi'
        : wifiConnected ? 'WiFi'
          : connected ? 'SPP'
            : 'NO LINK'

  // NAV highlight (u8g2 drawBox + setDrawColor(0) parity).
  const hl = (f: 'mode' | 'speed' | 'steer') => topField === f

  // Body content per drawDashboard dispatch.
  const body = (() => {
    if (previewComingSoon) return { kind: 'coming' as const, text: 'COMING SOON...' }
    if (previewMode) {
      if (previewMode.token === 'BT' || previewMode.controls.includes('drive-2wd1m')) {
        return { kind: 'dir' as const, text: driveStatus || 'Stop' }
      }
      if (previewMode.token === 'AUTO') return { kind: 'auto' as const }
      return { kind: 'title' as const, text: shownName }
    }
    if (shownIsAuto) return { kind: 'auto' as const }
    return { kind: 'dir' as const, text: driveStatus || 'Stop' }
  })()

  // Bottom status: car status when linked, link state otherwise.
  // In compact mode, omit the connection status — the chrome row handles it.
  const bottomStatus = connected
    ? (driveStatus || 'READY').toUpperCase()
    : wifiConnected ? 'CONNECTED' : 'READY'

  return (
    <View className={compact ? 'h-full w-full flex-col rounded-xl bg-slate-900 px-1.5 pb-1 pt-1 shadow-inner' : 'flex-1 rounded-2xl bg-slate-900 p-2 shadow-inner'}>
      {/* ── Top: Control Panel Bar — Mode | value with separator ── */}
      <View className={`flex-row items-center ${compact ? 'pb-0.5' : 'border-b border-slate-700 pb-1'}`}>
        {/* Mode field (inverted box when NAV-highlighted) */}
        <View
          className={compact ? 'min-w-0 flex-shrink flex-row items-center' : 'min-w-0 flex-shrink flex-row items-center'}
          style={hl('mode') ? { backgroundColor: '#e2e8f0', borderRadius: 2, paddingHorizontal: 3 } : undefined}
        >
          <Text
            numberOfLines={1}
            className={mono(`font-bold ${compact ? 'text-[11px]' : 'text-xs'} ${hl('mode') ? 'text-slate-900' : 'text-emerald-300'}`)}
          >
            {shownName}
          </Text>
        </View>
        {/* Vertical separator (ui.md: "separated by vertical line") */}
        <View className={compact ? 'mx-1 h-3 w-px bg-slate-500' : 'mx-1.5 h-3.5 w-px bg-slate-500'} />
        {/* Speed / Steer field (inverted box when NAV-highlighted) */}
        <View
          className="flex-row items-center"
          style={hl('speed') || hl('steer') ? { backgroundColor: '#e2e8f0', borderRadius: 2, paddingHorizontal: 3 } : undefined}
        >
          <Text className={mono(`text-[10px] uppercase ${compact ? '' : 'text-[10px]'} ${hl('speed') || hl('steer') ? 'text-slate-900' : 'text-slate-400'}`)}>
            {rightLabel}
          </Text>
          <Text className={mono(`${compact ? 'text-[11px]' : 'text-xs'} font-bold ${hl('speed') || hl('steer') ? 'text-slate-900' : 'text-emerald-300'}`)}>
            {' '}{rightFieldValue}
          </Text>
        </View>
      </View>

      {/* ── Body Space (mode-specific, drawDashboard dispatch) ── */}
      <View className="min-h-0 flex-1 items-center justify-center">
        {body.kind === 'dir' && (
          <Text
            numberOfLines={1}
            className={mono(`font-bold text-emerald-300 ${compact ? 'text-[15px]' : 'text-2xl'}`)}
          >
            {body.text}
          </Text>
        )}
        {body.kind === 'title' && (
          <Text numberOfLines={1} className={mono(`font-bold text-emerald-300 ${compact ? 'text-[12px]' : 'text-lg'}`)}>
            {body.text}
          </Text>
        )}
        {body.kind === 'coming' && (
          <Text numberOfLines={1} className={mono(`font-bold text-emerald-300 ${compact ? 'text-[11px]' : 'text-base'}`)}>
            COMING SOON...
          </Text>
        )}
        {body.kind === 'auto' && (
          <View className="w-full items-center">
            {/* Row 1: Angle — INVERTED (ui.md auto dashboard) */}
            <View className="rounded-sm bg-slate-200 px-1.5 py-px">
              <Text className={mono(`font-bold text-slate-900 ${compact ? 'text-[10px]' : 'text-sm'}`)}>
                Angle: {telemetry.angle != null ? `${telemetry.angle.toFixed(1)}°` : '--°'}
              </Text>
            </View>
            {/* Row 2: P & D evenly spaced */}
            <View className={`w-full flex-row justify-between ${compact ? 'px-1' : 'px-2'}`}>
              <Text className={mono(`text-emerald-300 ${compact ? 'text-[10px]' : 'text-xs'}`)}>
                P:{telemetry.kp != null ? telemetry.kp.toFixed(2) : pidKpLocal()}
              </Text>
              <Text className={mono(`text-emerald-300 ${compact ? 'text-[10px]' : 'text-xs'}`)}>
                D:{telemetry.kd != null ? telemetry.kd.toFixed(3) : pidKdLocal()}
              </Text>
            </View>
            {/* Row 3: OUT, I, OFF evenly spaced */}
            <View className={`w-full flex-row justify-between ${compact ? 'px-1' : 'px-2'}`}>
              <Text className={mono(`text-emerald-300 ${compact ? 'text-[10px]' : 'text-xs'}`)}>
                OUT:{telemetry.out != null ? telemetry.out.toFixed(0) : pidOutLocal()}
              </Text>
              <Text className={mono(`text-emerald-300 ${compact ? 'text-[10px]' : 'text-xs'}`)}>
                I:{telemetry.ki != null ? telemetry.ki.toFixed(3) : pidKiLocal()}
              </Text>
              <Text className={mono(`text-emerald-300 ${compact ? 'text-[10px]' : 'text-xs'}`)}>
                OFF:{telemetry.off != null ? telemetry.off.toFixed(1) : pidOffLocal()}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Bottom: Control & Status Bar — always inverted, centered ── */}
      <View className={`items-center rounded-sm bg-slate-200 ${compact ? 'py-0.5' : 'py-1'}`}>
        <Text
          numberOfLines={1}
          className={mono(`font-bold text-slate-900 ${compact ? 'text-[10px]' : 'text-xs'}`)}
        >
          {compact ? (driveStatus || 'READY').toUpperCase() : `${linkLabel} · ${bottomStatus}`}
        </Text>
      </View>
    </View>
  )
}

// Small local helpers so the AUTO fallback rows show the app's own PID
// state (what would be sent with CFG;...) when no live TEL frame has
// arrived yet. Declared after the component to keep the JSX readable.
function pidKpLocal(): string { return '12.00' }
function pidKiLocal(): string { return '3.000' }
function pidKdLocal(): string { return '1.000' }
function pidOutLocal(): string { return '0' }
function pidOffLocal(): string { return '0.0' }
