// =====================================================================
// AccountScreen - compact account panel (website parity). Shows a header
// card with the user's avatar + name, 3 stat cards (orders / cart / messages),
// the orders list, and a profile-edit section — all in a single scrollable
// panel like the website's /account. Not a full-screen FlatList.
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
  const { user, isSignedIn, isAdmin, signOut, setAuthSheetOpen, cartCount } = useApp()
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
          onPress={() => setAuthSheetOpen(true)}
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
        {/* Header card — compact like the website: avatar + name + email + role */}
        <View className="flex-row items-center rounded-2xl border border-line bg-card p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-navy">
            <Text className="text-sm font-black text-white">{initials}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Customer account</Text>
            <Text className="mt-0.5 text-lg font-display font-bold text-ink">{user?.name || 'Genum user'}</Text>
            <Text className="text-sm text-muted">{user?.email}</Text>
          </View>
          {isAdmin && (
            <View className="rounded-full bg-gold px-2 py-0.5">
              <Text className="text-xs font-black uppercase text-ink">Admin</Text>
            </View>
          )}
        </View>

        {/* Stat cards — like the website's 3-column row */}
        <View className="mt-4 flex-row flex-wrap gap-3">
          <View className="w-[47%] rounded-2xl border border-line bg-card p-4">
            <Text className="text-xs font-black uppercase tracking-widest text-muted">Orders placed</Text>
            <Text className="mt-1 font-display text-2xl font-bold text-ink">{orders.length}</Text>
          </View>
          <View className="w-[47%] rounded-2xl border border-line bg-card p-4">
            <Text className="text-xs font-black uppercase tracking-widest text-muted">Items in cart</Text>
            <Text className="mt-1 font-display text-2xl font-bold text-ink">{cartCount}</Text>
          </View>
          <View className="w-[47%] rounded-2xl border border-line bg-card p-4">
            <Text className="text-xs font-black uppercase tracking-widest text-muted">Messages</Text>
            <Text className="mt-1 font-display text-2xl font-bold text-ink">—</Text>
          </View>
        </View>

        {/* Profile edit toggle */}
        <View className="mt-4 flex-row flex-wrap gap-2">
          {editingProfile ? (
            <Pressable onPress={() => setEditingProfile(false)} className="rounded-full border border-line px-4 py-2">
              <Text className="text-xs font-bold text-ink">Cancel</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setEditingProfile(true)} className="rounded-full bg-navy px-4 py-2">
              <Text className="text-xs font-bold text-white">Edit Profile</Text>
            </Pressable>
          )}
          {isAdmin && (
            <Pressable onPress={() => navigation.push('Admin')} className="rounded-full bg-gold px-4 py-2">
              <Text className="text-xs font-bold text-ink">Admin Panel</Text>
            </Pressable>
          )}
        </View>

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
      </View>

      {/* Orders section */}
      <View className="px-5 pb-2">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Your orders</Text>
        {ordersLoading ? (
          <View className="mt-3 items-center py-6">
            <ActivityIndicator size="small" color="#1e3a8a" />
          </View>
        ) : orders.length === 0 ? (
          <View className="mt-3 items-center rounded-2xl border border-dashed border-line bg-card py-8">
            <Feather name="package" size={32} color="#cbd5e1" />
            <Text className="mt-2 text-sm text-muted">No orders yet.</Text>
          </View>
        ) : (
          <View className="mt-3 space-y-2">
            {orders.map((item) => (
              <View key={item.id} className="rounded-2xl border border-line bg-card p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-ink">{statusLabel(item.status)}</Text>
                  <Text className="text-xs text-muted">
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text className="mt-1 font-display text-lg font-bold text-navy">
                  NPR {item.total_npr.toLocaleString('en-IN')}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">#{item.id.slice(0, 8)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer: update check + legal links + sign out */}
      <View className="border-t border-line bg-card px-5 py-4">
        <View className="mb-3">
          <Text className="text-xs font-black uppercase tracking-[0.24em] text-muted">App</Text>
          <AppUpdateCard />
        </View>
        <View className="flex-row items-center justify-center gap-3 py-1">
          <Pressable onPress={() => navigation.push('Legal', { doc: 'privacy' })}>
            <Text className="text-sm font-bold text-navy underline">Privacy Policy</Text>
          </Pressable>
          <Text className="text-sm text-border">·</Text>
          <Pressable onPress={() => navigation.push('Legal', { doc: 'terms' })}>
            <Text className="text-sm font-bold text-navy underline">Terms of Service</Text>
          </Pressable>
        </View>
        <Pressable onPress={signOut} className="mt-3 items-center rounded-full border border-red-200 bg-card py-3">
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