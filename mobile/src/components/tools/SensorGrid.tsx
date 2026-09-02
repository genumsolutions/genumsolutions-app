// SensorGrid — relay toggles and live sensor values for non-robocar categories.
import React from 'react'
import { Switch, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { SensorGridProps, SensorData } from './types'

export function SensorGrid({
  canControl, isDrone, isNonRobocar, activeCategory,
  sensorData, relays, telemetry, onToggleRelay,
}: SensorGridProps) {
  if (isDrone || !isNonRobocar) return null

  return (
    <>
      {/* Relay toggles for home-automation / smart-farm / smart-city */}
      <View className="mt-4 rounded-xl border border-line bg-surface p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-border">
          {activeCategory === 'smart-farm' ? 'Pumps / solenoids' : 'Outputs'}
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Switch
                value={relays[i]}
                onValueChange={() => onToggleRelay(i)}
                disabled={!canControl}
                trackColor={{ true: '#1e3a8a', false: '#e2e8f0' }}
              />
              <Text className="text-xs font-semibold text-ink">Relay {i}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Sensor grid */}
      <View className="mt-4 rounded-xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-1">
          <Feather name="activity" size={12} color="#94a3b8" />
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Live Sensors</Text>
        </View>
        <View className="mt-3 flex-row flex-wrap gap-2">
          <SensorCard
            icon="thermometer"
            label="Temperature"
            value={`${sensorData.temperature}°C`}
            color="#ef4444"
          />
          <SensorCard
            icon="droplet"
            label="Humidity"
            value={`${sensorData.humidity}%`}
            color="#3b82f6"
          />
          {activeCategory === 'smart-farm' && (
            <SensorCard
              icon="layers"
              label="Soil Moisture"
              value={`${sensorData.soilMoisture}%`}
              color="#22c55e"
            />
          )}
          {activeCategory === 'smart-city' && (
            <>
              <SensorCard
                icon="sun"
                label="Light Level"
                value={`${sensorData.lightLevel}%`}
                color="#f59e0b"
              />
              <SensorCard
                icon="wind"
                label="Air Quality"
                value={`${sensorData.airQuality}ppm`}
                color="#8b5cf6"
              />
            </>
          )}
          {(activeCategory === 'home-automation' || activeCategory === 'smart-city') && (
            <SensorCard
              icon="maximize-2"
              label="Distance"
              value={`${sensorData.distance}cm`}
              color="#06b6d4"
            />
          )}
        </View>
      </View>

      {/* Live telemetry (BLE-specific) */}
      {(telemetry.speed != null || telemetry.mode) && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Live telemetry</Text>
          <View className="mt-2 flex-row flex-wrap gap-4">
            {telemetry.speed != null && (
              <Text className="text-xs text-muted">Speed: <Text className="font-mono font-bold text-navy">{telemetry.speed}</Text></Text>
            )}
            {telemetry.mode && (
              <Text className="text-xs text-muted">Mode: <Text className="font-mono font-bold text-navy">{telemetry.mode}</Text></Text>
            )}
            {telemetry.status && (
              <Text className="text-xs text-muted">Status: <Text className="font-mono font-bold text-navy">{telemetry.status}</Text></Text>
            )}
            {telemetry.angle != null && (
              <Text className="text-xs text-muted">Angle: <Text className="font-mono font-bold text-navy">{telemetry.angle.toFixed(1)}°</Text></Text>
            )}
          </View>
        </View>
      )}
    </>
  )
}

function SensorCard({ icon, label, value, color }: {
  icon: string
  label: string
  value: string
  color: string
}) {
  return (
    <View className="w-[30%] rounded-xl bg-card border border-line p-3">
      <Feather name={icon as any} size={16} color={color} />
      <Text className="mt-1 text-xs font-bold uppercase text-muted">{label}</Text>
      <Text className="mt-0.5 font-mono text-sm font-bold" style={{ color }}>{value}</Text>
    </View>
  )
}
