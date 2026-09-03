// =====================================================================
// OfflineBadge — small amber pill shown when catalog data came from the
// local AsyncStorage cache instead of the live Supabase catalog.
// =====================================================================
import React from 'react'
import { Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

export function OfflineBadge() {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5">
      <Feather name="cloud-off" size={12} color="#b45309" />
      <Text className="text-xs font-bold text-amber-700">Offline · showing cached data</Text>
    </View>
  )
}