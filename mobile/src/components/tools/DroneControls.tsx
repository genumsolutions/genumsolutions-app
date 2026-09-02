// DroneControls — altitude slider, gimbal pan/tilt, takeoff/land/emergency.
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { DroneControlsProps } from './types'

export function DroneControls({
  canControl, targetAltitude, gimbalPan, gimbalTilt,
  onAltitude, onGimbalPan, onGimbalTilt, onCommand, onSetAltitude,
}: DroneControlsProps) {
  return (
    <View className="mt-2">
      {/* Altitude control */}
      <View className="rounded-xl border border-line bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <Feather name="arrow-up" size={12} color="#94a3b8" />
            <Text className="text-xs font-bold uppercase tracking-wide text-border">Altitude (m)</Text>
          </View>
          <Text className="font-mono text-sm font-bold text-navy">{targetAltitude}m</Text>
        </View>
        <Slider
          value={targetAltitude}
          minimumValue={0}
          maximumValue={50}
          step={0.5}
          onValueChange={onAltitude}
          disabled={!canControl}
          minimumTrackTintColor="#1e3a8a"
          maximumTrackTintColor="#cbd5e1"
          thumbTintColor="#1e3a8a"
        />
        <View className="mt-2 flex-row gap-2">
          <Pressable
            onPress={() => onCommand('TAKEOFF')}
            disabled={!canControl}
            className="flex-1 items-center rounded-full bg-emerald-600 py-2.5"
          >
            <Text className="text-xs font-black text-white">Take Off</Text>
          </Pressable>
          <Pressable
            onPress={() => onCommand('LAND')}
            disabled={!canControl}
            className="flex-1 items-center rounded-full bg-amber-600 py-2.5"
          >
            <Text className="text-xs font-black text-white">Land</Text>
          </Pressable>
          <Pressable
            onPress={() => { onSetAltitude(0); onCommand('EMERGENCY') }}
            disabled={!canControl}
            className="flex-1 items-center rounded-full bg-red-600 py-2.5"
          >
            <Text className="text-xs font-black text-white">Emergency Stop</Text>
          </Pressable>
        </View>
      </View>

      {/* Gimbal control */}
      <View className="mt-4 rounded-xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-1">
          <Feather name="video" size={12} color="#94a3b8" />
          <Text className="text-xs font-bold uppercase tracking-wide text-border">Camera Gimbal</Text>
        </View>
        <View className="mt-3 flex-row gap-4">
          <View className="flex-1">
            <Text className="text-xs font-bold text-muted">Pan: {gimbalPan}°</Text>
            <Slider
              value={gimbalPan}
              minimumValue={0}
              maximumValue={180}
              step={1}
              onValueChange={onGimbalPan}
              disabled={!canControl}
              minimumTrackTintColor="#1e3a8a"
              maximumTrackTintColor="#cbd5e1"
              thumbTintColor="#1e3a8a"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-muted">Tilt: {gimbalTilt}°</Text>
            <Slider
              value={gimbalTilt}
              minimumValue={0}
              maximumValue={180}
              step={1}
              onValueChange={onGimbalTilt}
              disabled={!canControl}
              minimumTrackTintColor="#1e3a8a"
              maximumTrackTintColor="#cbd5e1"
              thumbTintColor="#1e3a8a"
            />
          </View>
        </View>
      </View>
    </View>
  )
}
