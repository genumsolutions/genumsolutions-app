// OledDisplay — simulated OLED status screen showing connection + telemetry.
import React from 'react'
import { Text, View } from 'react-native'
import type { OledDisplayProps } from './types'

export function OledDisplay({
  connected, wifiConnected, deviceName, activeMode,
  speed, servo, driveStatus, targetAltitude, gimbalPan, gimbalTilt,
  sensorData, telemetry, isDrone, isNonRobocar,
}: OledDisplayProps) {
  return (
    <View className="rounded-xl bg-slate-900 p-3 shadow-inner">
      <View className="flex-row items-center justify-between border-b border-slate-700 px-2 pb-2">
        <Text className="font-mono text-xs font-bold text-emerald-400">
          {connected ? deviceName : wifiConnected ? 'WiFi' : '---'}
        </Text>
        <Text className="font-mono text-xs text-slate-500">
          {connected ? 'BLE LINK' : wifiConnected ? 'WiFi WS' : 'NO LINK'}
        </Text>
      </View>
      <View className="mt-2 px-2">
        <Text className="font-mono text-sm text-emerald-300">
          {activeMode.name.split('·')[0].trim()}{' '}
          {activeMode.controls.includes('drive-2wd1m') ? `STEER ${servo}` : `SPD ${speed}`}
        </Text>
        <Text className="font-mono text-sm text-emerald-300">
          {connected ? driveStatus : wifiConnected ? 'CONNECTED' : 'NO LINK'}
        </Text>
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
        {telemetry.angle != null && (
          <Text className="font-mono text-sm text-emerald-400">ANGLE {telemetry.angle.toFixed(1)}</Text>
        )}
        {telemetry.mode && <Text className="font-mono text-sm text-emerald-300">M:{telemetry.mode}</Text>}
      </View>
    </View>
  )
}
