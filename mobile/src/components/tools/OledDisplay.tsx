// OledDisplay — mirrors the car's 1.3" OLED (SH1106 128x64) display.
// Shows the same info as the ESP32 car OLED: header, mode, status, speed/steer,
// BT connection state. Modeled after Genum_2WD1M_CAR_V1.0.0/ui.md.
import React from 'react'
import { Text, View } from 'react-native'
import type { OledDisplayProps } from './types'

export function OledDisplay({
  connected, wifiConnected, deviceName, activeMode,
  speed, servo, driveStatus, targetAltitude, gimbalPan, gimbalTilt,
  sensorData, telemetry, isDrone, isNonRobocar, linkKind,
}: OledDisplayProps) {
  // Link label matches what the car OLED shows (SPP LINK / WiFi WS / NO LINK)
  const linkLabel =
    linkKind === 'spp' ? 'SPP LINK'
      : linkKind === 'wifi' ? 'WiFi WS'
        : wifiConnected ? 'WiFi WS'
          : connected ? 'SPP LINK'
            : 'NO LINK'

  // 2WD1M shows steering instead of speed (matches ESP remote)
  const is2wd1m = activeMode.controls.includes('drive-2wd1m')

  return (
    <View className="rounded-xl bg-slate-900 p-3 shadow-inner">
      {/* Header line - car project name */}
      <View className="flex-row items-center justify-between border-b border-slate-700 px-2 pb-2">
        <Text className="font-mono text-xs font-bold text-emerald-400">
          {connected ? deviceName : wifiConnected ? 'WiFi' : '---'}
        </Text>
        <Text className="font-mono text-xs text-slate-500">
          {linkLabel}
        </Text>
      </View>

      {/* Body - mirrors car OLED dashboard */}
      <View className="mt-2 px-2">
        {/* Mode line - matches car OLED "Mode : <mode>" */}
        <Text className="font-mono text-sm text-emerald-300">
          Mode : {is2wd1m ? '2WD1M' : activeMode.name.split('·')[0].trim()}
        </Text>

        {/* Status line - matches car OLED "Status : <status>" */}
        <Text className="font-mono text-sm text-emerald-300">
          {connected ? `Status : ${driveStatus}` : wifiConnected ? 'CONNECTED' : 'NO LINK'}
        </Text>

        {/* Speed or Steering line (2WD1M shows STEER, others show SPD) */}
        <Text className="font-mono text-sm text-emerald-300">
          {is2wd1m ? `Steer : ${servo}°` : `Speed : ${speed}`}
        </Text>

        {/* Telemetry extras for specific modes */}
        {isDrone && (
          <Text className="font-mono text-sm text-emerald-400">
            ALT {targetAltitude}m · GIMBAL P:{gimbalPan}° T:{gimbalTilt}°
          </Text>
        )}

        {isNonRobocar && !isDrone && (
          <Text className="font-mono text-sm text-emerald-400">
            T:{sensorData.temperature}°C H:{sensorData.humidity}%
          </Text>
        )}

        {/* Self-balancing live angle (from TEL telemetry) */}
        {telemetry.angle != null && (
          <Text className="font-mono text-sm text-emerald-400">
            ANGLE {telemetry.angle.toFixed(1)}°
          </Text>
        )}

        {/* Live PID values for self-balancing */}
        {telemetry.kp != null && (
          <Text className="font-mono text-xs text-emerald-500">
            P:{telemetry.kp.toFixed(2)} I:{telemetry.ki?.toFixed(3)} D:{telemetry.kd?.toFixed(3)}
          </Text>
        )}

        {/* Mode echo from car STATE */}
        {telemetry.mode && !is2wd1m && (
          <Text className="font-mono text-xs text-emerald-500">
            M:{telemetry.mode}
          </Text>
        )}
      </View>
    </View>
  )
}
