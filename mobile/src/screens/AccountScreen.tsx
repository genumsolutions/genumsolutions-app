// =====================================================================
// AccountScreen - minimal account panel (website parity).
// Shows user name, email, admin badge, and sign-out.
// Account dropdown from the header (BrandHeader/AccountSheet) takes
// precedence; this screen is accessible via navigation but the primary
// account UI is the header dropdown.
// =====================================================================
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useApp } from '../context/AppContext'
import { getMyOrders, updateProfile } from '../services/orderService'
import { AppUpdateCard } from '../components/AppUpdateCard'
import type { Order } from '../types'

export function AccountScreen() {
  const navigation = useNavigation<any>()
  const { user, isSignedIn, isAdmin, signOut, cartCount, themeMode, setThemeMode } = useApp()
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [address, setAddress] = useState(user?.address || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

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

  async function saveProfile() {
    setProfileSaving(true)
    setProfileSaved(false)
    try {
      await updateProfile(user?.id || '', { name, phone, address })
      setProfileSaved(true)
      setEditingProfile(false)
    } catch {
      // no-op
    } finally {
      setProfileSaving(false)
    }
  }

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
          <Feather name="user" size={26} color="#ffffff" />
        </View>
        <Text className="mt-4 font-display text-xl font-bold text-ink">Sign in to account</Text>
        <Text className="mt-1 text-center text-sm text-muted">
          Access your profile, orders, and synced build list.
        </Text>
        <Pressable
          onPress={() => navigation.push('Auth', { screen: 'SignIn' })}
          className="mt-6 w-full max-w-xs items-center rounded-full bg-navy py-3"
        >
          <Text className="font-bold text-white">Sign in</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface">
      <View className="px-5 pb-2 pt-4">
        {/* Header card — avatar + name + email + admin badge */}
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-card p-4">
          <View className="min-w-0 flex-1 flex-row items-center">
            <View className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy">
              <Text className="text-sm font-black text-white">{initials}</Text>
            </View>
            <View className="ml-3 min-w-0 flex-1">
              <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Customer account</Text>
              <Text className="mt-0.5 font-display text-xl font-bold tracking-tight text-ink" numberOfLines={1}>
                Welcome, {user?.name || 'Genum user'}.
              </Text>
              <Text className="mt-0.5 text-sm text-muted" numberOfLines={1}>{user?.email}</Text>
            </View>
          </View>
          {isAdmin && (
            <View className="shrink-0 rounded-full bg-gold px-2 py-0.5">
              <Text className="text-xs font-black uppercase text-ink">Admin</Text>
            </View>
          )}
        </View>

        {/* Profile edit toggle */}
        {editingProfile ? (
          <Pressable onPress={() => setEditingProfile(false)} className="rounded-full border border-line px-4 py-2">
            <Text className="text-xs font-bold text-ink">Cancel</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setEditingProfile(true)} className="rounded-full bg-navy px-4 py-2">
            <Text className="text-xs font-bold text-white">Edit Profile</Text>
          </Pressable>
        )}

        {/* Profile edit form */}
        {editingProfile && (
          <View className="mt-3 rounded-xl border border-line bg-card p-4">
            <Text className="text-sm font-bold text-ink mb-3">Edit Profile</Text>
            <TextInput value={name} onChangeText={setName} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Name" />
            <TextInput value={phone} onChangeText={setPhone} className="mb-3 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Phone" keyboardType="phone-pad" />
            <TextInput value={address} onChangeText={setAddress} className="mb-4 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" placeholder="Address" multiline />
            <View className="flex-row gap-3">
              <Pressable
                onPress={saveProfile}
                disabled={profileSaving}
                className="rounded-full bg-gold px-5 py-2"
              >
                <Text className="text-xs font-black text-ink">{profileSaving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
              {profileSaved && (
                <Text className="text-xs font-bold text-emerald-700">Details saved.</Text>
              )}
            </View>
          </View>
        )}

        {/* Sign out */}
        <Pressable onPress={signOut} className="mt-4 items-center rounded-full border border-red-200 bg-card py-3">
          <Text className="text-sm font-bold text-red-600">Sign out</Text>
        </Pressable>
      </View>
    </View>
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