// =====================================================================
// AccountScreen - native "My Account" page (website /account parity).
// Mirrors the website's AccountPanel layout:
//   - header (avatar, name, email, admin badge, sign out)
//   - stats row: orders placed · build-list item types · support messages
//   - "Your orders" (status pill, provider, total, line items)
//   - "Your details" (name / phone / address profile form)
//   - "Your messages" (support history with status pills)
//
// App updates + theme toggles now live on the Menu tab (visible without
// signing in); nothing here gates updates behind an account.
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
import { useApp } from '../context/AppContext'
import {
  getMyMessages,
  getMyOrders,
  updateProfile,
} from '../services/orderService'
import type { Order } from '../types'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  fulfilled: 'bg-navy/10 text-navy',
  cancelled: 'bg-red-100 text-red-700',
}

function statusLabel(status: string): string {
  return status || 'pending'
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'cod': return 'Pay on delivery'
    case 'esewa': return 'eSewa'
    case 'khalti': return 'Khalti'
    default: return provider
  }
}

function formatNPR(amount: number): string {
  return `NPR ${(amount || 0).toLocaleString('en-IN')}`
}

export function AccountScreen() {
  const { user, isSignedIn, isAdmin, signOut, cartCount, setAuthSheetOpen } = useApp()
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [messages, setMessages] = useState<{ message: string; status: string; createdAt: string }[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
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
    if (!isSignedIn) return
    setMessagesLoading(true)
    getMyMessages()
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false))
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
        {/* Header card — avatar + name + email + admin badge + sign out */}
        <View className="rounded-2xl border border-line bg-card p-4">
          <View className="flex-row items-center justify-between">
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
          <Pressable
            onPress={signOut}
            className="mt-4 items-center rounded-full border border-red-200 bg-card py-2.5"
          >
            <Text className="text-sm font-bold text-red-600">Log out</Text>
          </Pressable>
        </View>

        {/* Stats row — orders placed · build-list item types · support messages */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-line bg-card p-4">
            <Text className="font-display text-3xl font-bold text-ink">
              {ordersLoading ? '…' : orders.length}
            </Text>
            <Text className="mt-1 text-xs font-semibold text-muted">
              Order{orders.length === 1 ? '' : 's'} placed
            </Text>
          </View>
          <View className="flex-1 rounded-2xl border border-line bg-card p-4">
            <Text className="font-display text-3xl font-bold text-ink">{cartCount}</Text>
            <Text className="mt-1 text-xs font-semibold text-muted">Items in build list</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-line bg-card p-4">
            <Text className="font-display text-3xl font-bold text-ink">
              {messagesLoading ? '…' : messages.length}
            </Text>
            <Text className="mt-1 text-xs font-semibold text-muted">
              Support message{messages.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {/* Your orders — status pill + provider + total + line items */}
        <View className="mt-5 rounded-2xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">Your orders</Text>
          {ordersLoading ? (
            <View className="mt-4 items-center py-4">
              <ActivityIndicator color="#1e3a8a" />
            </View>
          ) : orders.length === 0 ? (
            <Text className="mt-3 text-sm text-muted">
              No orders yet — they appear here right after checkout.
            </Text>
          ) : (
            <View className="mt-3 space-y-3">
              {orders.map((o) => (
                <View key={o.id} className="rounded-xl border border-line p-4">
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-bold text-ink">#{o.id.slice(0, 8).toUpperCase()}</Text>
                      <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                        {new Date(o.created_at).toLocaleDateString()} · {providerLabel(o.provider)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Text className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_STYLES[statusLabel(o.status)] || 'bg-slate-100 text-slate-700'}`}>
                        {statusLabel(o.status)}
                      </Text>
                      <Text className="font-black text-ink">{formatNPR(o.total_npr)}</Text>
                    </View>
                  </View>
                  <View className="mt-2">
                    {o.items.map((item) => (
                      <Text key={`${o.id}-${item.name}`} className="text-xs leading-5 text-muted" numberOfLines={1}>
                        {item.quantity} × {item.name} · {formatNPR(item.priceNpr * item.quantity)}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Your details — profile edit */}
        <View className="mt-5 rounded-2xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">Your details</Text>
          <Text className="mt-1 text-sm text-muted">Used for delivery and order updates.</Text>

          {!editingProfile ? (
            <Pressable onPress={() => setEditingProfile(true)} className="mt-3 rounded-full bg-navy px-4 py-2 self-start">
              <Text className="text-xs font-bold text-white">Edit Profile</Text>
            </Pressable>
          ) : (
            <View className="mt-3">
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">Name</Text>
              <TextInput value={name} onChangeText={setName} className="mt-1 mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Name" />
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">Phone</Text>
              <TextInput value={phone} onChangeText={setPhone} className="mt-1 mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Phone" keyboardType="phone-pad" />
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">Delivery address</Text>
              <TextInput value={address} onChangeText={setAddress} className="mt-1 mb-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Address" multiline />
              <View className="flex-row gap-3">
                <Pressable
                  onPress={saveProfile}
                  disabled={profileSaving}
                  className="rounded-full bg-gold px-5 py-2"
                >
                  <Text className="text-xs font-black text-ink">{profileSaving ? 'Saving…' : 'Save details'}</Text>
                </Pressable>
                {profileSaved && (
                  <Text className="self-center text-xs font-bold text-emerald-700">Details saved.</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Your messages — support history with status pills */}
        <View className="mt-5 rounded-2xl border border-line bg-card p-4">
          <Text className="font-display text-lg font-bold text-ink">Your messages</Text>
          {messagesLoading ? (
            <View className="mt-4 items-center py-4">
              <ActivityIndicator color="#1e3a8a" />
            </View>
          ) : messages.length === 0 ? (
            <Text className="mt-3 text-sm text-muted">
              No messages yet. Ask us about a project from the Contact page.
            </Text>
          ) : (
            <View className="mt-3">
              {messages.map((m, i) => (
                <View key={m.createdAt + String(i)} className="py-3 first:pt-0 last:pb-0" style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#e2e8f0' }}>
                  <Text className="text-sm leading-6 text-ink">{m.message}</Text>
                  <View className="mt-2 flex-row items-center gap-2">
                    <Text className="text-xs text-muted">{new Date(m.createdAt).toLocaleDateString()}</Text>
                    <Text className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${m.status === 'replied' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {m.status === 'replied' ? 'Replied' : 'New'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}