// AccountSheet — graceful account dropdown anchored under the header
// account button (top-right). Shows a professional summary: initials avatar
// + name + gold Admin chip, the latest orders with status pills, then
// My Profile / Admin Panel / Sign out (with inline confirm). Built as a
// drop-down card (no full-screen takeover, no duplicate content — the full
// Account screen stays a separate page).
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  Vibration,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useApp } from '../context/AppContext'
import { getMyOrders } from '../services/orderService'
import type { Order } from '../types'

type Props = {
  visible: boolean
  onRequestClose: () => void
}

const STATUS_PILL: Record<Order['status'], { box: string; text: string }> = {
  pending: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-700' },
  paid: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
  fulfilled: { box: 'border-sky-200 bg-sky-50', text: 'text-sky-700' },
  cancelled: { box: 'border-red-200 bg-red-50', text: 'text-red-700' },
}

function StatusPill({ status }: { status: Order['status'] }) {
  const s = STATUS_PILL[status] ?? STATUS_PILL.pending
  return (
    <View className={`rounded-full border px-2.5 py-1 ${s.box}`}>
      <Text className={`text-xs font-black uppercase tracking-wide ${s.text}`}>{status}</Text>
    </View>
  )
}

function MenuRow({ icon, label, sub, danger, onPress }: {
  icon: 'user' | 'shield' | 'log-out'
  label: string
  sub: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={() => { Vibration.vibrate(10); onPress() }}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-mist"
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full ${danger ? 'bg-red-50' : 'bg-mist'}`}>
        <Feather name={icon} size={16} color={danger ? '#dc2626' : '#1e3a8a'} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className={`text-sm font-bold ${danger ? 'text-red-600' : 'text-ink'}`}>{label}</Text>
        <Text className="text-xs text-muted" numberOfLines={1}>{sub}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="#94a3b8" />
    </Pressable>
  )
}

export function AccountSheet({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { user, isSignedIn, isAdmin, signOut } = useApp()
  const nav = useNavigation<any>()
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersError, setOrdersError] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  // Load the latest orders whenever the sheet opens (fresh data, no stale
  // rows) and reset the sign-out confirm state.
  useEffect(() => {
    if (!visible) { setShowSignOutConfirm(false); return }
    setLoading(true)
    setOrdersError(false)
    getMyOrders()
      .then((rows) => setOrders(rows))
      .catch(() => setOrdersError(true))
      .finally(() => setLoading(false))
  }, [visible])

  const confirmSignOut = useCallback(async () => {
    setShowSignOutConfirm(false)
    if (isSignedIn) {
      await signOut()
      onRequestClose()
    }
  }, [isSignedIn, onRequestClose, signOut])

  const navProfile = useCallback(() => {
    onRequestClose()
    nav.push('Account')
  }, [nav, onRequestClose])

  const navAdmin = useCallback(() => {
    onRequestClose()
    nav.push('Admin')
  }, [nav, onRequestClose])

  const cardW = Math.min(width - 24, 316)
  const cardMaxH = Math.max(180, height - insets.top - 60)

  if (!isSignedIn) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
        <Pressable style={{ flex: 1 }} onPress={onRequestClose} />
        <View
          style={{ position: 'absolute', right: 12, top: insets.top + 54, width: cardW }}
          className="rounded-2xl border border-line bg-card p-6 shadow-xl"
        >
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-mist">
              <Feather name="user" size={18} color="#1e3a8a" />
            </View>
            <Text className="text-sm font-bold text-ink">Sign in to access your account</Text>
          </View>
          <Pressable
            onPress={onRequestClose}
            accessibilityRole="button"
            className="mt-4 rounded-full bg-navy px-5 py-2.5 items-center"
          >
            <Text className="text-sm font-bold text-white">Sign in</Text>
          </Pressable>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={{ flex: 1 }} onPress={() => { setShowSignOutConfirm(false); onRequestClose() }} accessibilityLabel="Close account" />
      <View
        style={{ position: 'absolute', right: 12, top: insets.top + 54, width: cardW, maxHeight: cardMaxH }}
        className="overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 8 }}>
          {/* Header: avatar + name + gold Admin chip + email */}
          <View className="border-b border-line bg-mist/60 p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-navy">
                <Text className="text-base font-black text-white">{initials}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="min-w-0 flex-1 truncate text-base font-bold text-ink">
                    {user?.name || 'User'}
                  </Text>
                  {isAdmin && (
                    <View className="shrink-0 rounded-full bg-gold px-2 py-0.5">
                      <Text className="text-[10px] font-black uppercase tracking-wide text-ink">Admin</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} className="mt-0.5 text-sm text-muted">{user?.email}</Text>
              </View>
              <Pressable onPress={onRequestClose} accessibilityLabel="Close account" className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist">
                <Feather name="x" size={16} color="#64748b" />
              </Pressable>
            </View>
          </View>

          {/* Latest orders — status shown elegantly with colored pills */}
          <View className="p-4">
            <Text className="text-xs font-black uppercase tracking-wider text-slate-400">Latest orders</Text>
            {loading ? (
              <View className="mt-3 items-center py-2">
                <ActivityIndicator color="#1e3a8a" />
              </View>
            ) : ordersError ? (
              <Text className="mt-2 text-xs text-slate-400">Couldn't load your orders.</Text>
            ) : orders.length === 0 ? (
              <View className="mt-3 rounded-xl border border-dashed border-line bg-mist/40 px-3 py-4">
                <Text className="text-center text-sm text-muted">No orders yet — your purchases will show up here.</Text>
              </View>
            ) : (
              orders.slice(0, 3).map((o) => (
                <View key={o.id} className="mt-2 rounded-xl border border-line bg-surface px-3 py-2.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-xs font-bold text-ink">#{o.id.slice(0, 8).toUpperCase()}</Text>
                    <StatusPill status={o.status} />
                  </View>
                  <View className="mt-1.5 flex-row items-center justify-between gap-2">
                    <Text className="min-w-0 flex-1 text-xs text-muted" numberOfLines={1}>
                      {new Date(o.created_at).toLocaleDateString()} · {o.provider}
                    </Text>
                    <Text className="text-sm font-black text-ink">NPR {o.total_npr.toLocaleString()}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Actions */}
          <View className="border-t border-line px-3 py-2">
            <MenuRow icon="user" label="My Profile" sub="Edit name, phone, address" onPress={navProfile} />
            {isAdmin && <MenuRow icon="shield" label="Admin Panel" sub="Manage orders & store" onPress={navAdmin} />}
            <View className="mt-1 border-t border-line pt-1">
              {!showSignOutConfirm ? (
                <MenuRow icon="log-out" label="Sign out" sub="Sign out of this device" danger onPress={() => { Vibration.vibrate(10); setShowSignOutConfirm(true) }} />
              ) : (
                <View className="mt-1 flex-row items-center justify-between rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                  <Text className="text-sm font-bold text-red-700">Sign out?</Text>
                  <View className="flex-row items-center gap-2">
                    <Pressable onPress={() => setShowSignOutConfirm(false)} accessibilityRole="button" className="rounded-full border border-line bg-card px-3.5 py-1.5">
                      <Text className="text-sm font-bold text-ink">Cancel</Text>
                    </Pressable>
                    <Pressable onPress={confirmSignOut} accessibilityRole="button" className="rounded-full bg-red-600 px-3.5 py-1.5">
                      <Text className="text-sm font-black text-white">Sign out</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}