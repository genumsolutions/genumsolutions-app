// =====================================================================
// AccountScreen - sign-in state, profile info, orders, admin access,
// and profile editing. Uses the shared Supabase `orders` table.
// =====================================================================
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useApp } from '../context/AppContext'
import { getMyOrders, updateProfile } from '../services/orderService'
import type { Order } from '../types'

export function AccountScreen() {
  const navigation = useNavigation<any>()
  const { user, isSignedIn, isAdmin, signOut, setAuthSheetOpen } = useApp()
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')

  useEffect(() => {
    if (!isSignedIn) return
    setOrdersLoading(true)
    getMyOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false))
  }, [isSignedIn])

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone || '')
      setAddress(user.address || '')
    }
  }, [user])

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
          <Feather name="user" size={26} color="#ffffff" />
        </View>
        <Text className="mt-4 text-lg font-bold text-ink">Sign in to account</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Access your profile, orders, and synced build list.
        </Text>
        <Pressable
          onPress={() => setAuthSheetOpen(true)}
          className="mt-6 w-full max-w-xs items-center rounded-full bg-navy py-3"
        >
          <Text className="font-bold text-white">Sign in</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <>
          <View className="flex-row items-center rounded-2xl border border-line bg-white p-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-navy">
              <Text className="text-sm font-black text-white">{initials}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold text-ink">{user?.name || 'Genum user'}</Text>
              <Text className="text-xs text-muted">{user?.email}</Text>
            </View>
            {isAdmin && (
              <View className="rounded-full bg-gold px-2 py-0.5">
                <Text className="text-[10px] font-black uppercase text-ink">Admin</Text>
              </View>
            )}
          </View>

          {editingProfile ? (
            <View className="mt-4 rounded-xl border border-line bg-white p-4">
              <Text className="text-sm font-bold text-ink mb-3">Edit Profile</Text>
              <TextInput value={name} onChangeText={setName} className="mb-3 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" placeholder="Name" />
              <TextInput value={phone} onChangeText={setPhone} className="mb-3 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" placeholder="Phone" keyboardType="phone-pad" />
              <TextInput value={address} onChangeText={setAddress} className="mb-4 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" placeholder="Address" multiline />
              <View className="flex-row gap-3">
                <Pressable
                  onPress={async () => {
                    await updateProfile(user?.id || '', { name, phone, address })
                    setEditingProfile(false)
                  }}
                  className="rounded-full bg-gold px-5 py-2"
                >
                  <Text className="text-xs font-black text-ink">Save</Text>
                </Pressable>
                <Pressable onPress={() => setEditingProfile(false)} className="rounded-full border border-line px-5 py-2">
                  <Text className="text-xs font-black text-ink">Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="mt-4 flex-row flex-wrap gap-2">
              <Pressable onPress={() => setEditingProfile(true)} className="rounded-full bg-navy px-4 py-2">
                <Text className="text-xs font-bold text-white">Edit Profile</Text>
              </Pressable>
              {isAdmin && (
                <Pressable onPress={() => navigation.navigate('Admin')} className="rounded-full bg-gold px-4 py-2">
                  <Text className="text-xs font-bold text-ink">Admin Panel</Text>
                </Pressable>
              )}
            </View>
          )}

          <View className="mt-4">
            <Text className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-navy">
              Your orders
            </Text>
            {ordersLoading ? (
              <View className="items-center py-6">
                <ActivityIndicator size="small" color="#1e3a8a" />
              </View>
            ) : null}
          </View>
        </>
      }
      data={orders}
      keyExtractor={(o) => o.id}
      ListEmptyComponent={
        ordersLoading ? null : (
          <View className="items-center rounded-2xl border border-dashed border-line bg-white py-8">
            <Feather name="package" size={32} color="#cbd5e1" />
            <Text className="mt-2 text-sm text-muted">No orders yet.</Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <View className="mb-2 rounded-2xl border border-line bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-ink">{statusLabel(item.status)}</Text>
            <Text className="text-xs text-muted">
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text className="mt-2 font-sans text-lg font-bold text-navy">
            NPR {item.total_npr.toLocaleString('en-IN')}
          </Text>
          <Text className="mt-1 text-xs text-muted">#{item.id.slice(0, 8)}</Text>
        </View>
      )}
      ListFooterComponent={
        <Pressable onPress={signOut} className="mt-4 items-center rounded-full border border-red-200 bg-white py-3">
          <Text className="text-sm font-bold text-red-600">Sign out</Text>
        </Pressable>
      }
    />
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'paid': return 'Paid'
    case 'fulfilled': return 'Fulfilled'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
}