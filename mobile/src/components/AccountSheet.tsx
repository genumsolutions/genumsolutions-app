// AccountSheet - dropdown sheet from header account button.
// Shows minimal account info (name/email/admin badge) and sign-out.
// Replaces the full-screen Account screen; tabs remain visible below.
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  Vibration,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useApp } from '../context/AppContext'

type Props = {
  visible: boolean
  onRequestClose: () => void
}

export function AccountSheet({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets()
  const { user, isSignedIn, isAdmin, signOut } = useApp()
  const nav = useNavigation<any>()
  const [name, setName] = useState(user?.name || '')
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const initials = (user?.name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  const handleSignOut = async () => {
    Vibration.vibrate(10)
    setShowSignOutConfirm(true)
  }

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false)
    if (isSignedIn) {
      await signOut()
      onRequestClose()
    }
  }

  if (!isSignedIn) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onRequestClose}
      >
        <View className="p-4 text-center">
          <Text className="text-sm text-slate-400">Sign in to access account</Text>
          <Pressable
            onPress={onRequestClose}
            className="mt-3 rounded-full bg-navy px-4 py-2"
          >
            <Text className="text-sm font-bold text-white">Sign in</Text>
          </Pressable>
        </View>
      </Modal>
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 12),
          paddingTop: insets.top > 0 ? 4 : 0,
        }}
        className="rounded-t-3xl border border-line bg-card p-4"
      >
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy">
              <Text className="text-sm font-black text-white">{initials}</Text>
            </View>
            <Text className="mt-1 font-bold text-ink">{name}</Text>
            {isAdmin && (
              <Text className="mt-0.5 text-xs font-black uppercase text-ink">Admin</Text>
            )}
          </View>
          <Pressable
            onPress={onRequestClose}
            accessibilityLabel="Close account"
            className="h-8 w-8 items-center justify-center rounded-full bg-mist"
          >
            <Feather name="x" size={16} color="#64748b" />
          </Pressable>
        </View>

        <View className="mt-3 px-1">
          <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Menu</Text>
          <View className="mt-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => onRequestClose()}
              accessibilityRole="button"
            >
              <Text className="text-sm text-slate-500">My Profile</Text>
            </Pressable>
            {isAdmin && (
              <Pressable
                onPress={() => nav.push('Admin')}
                accessibilityRole="button"
              >
                <Text className="text-sm text-slate-500">Admin Panel</Text>
              </Pressable>
            )}
          </View>
          <View className="mt-3 flex-row items-center gap-3">
            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Feather name="log-out" size={16} color="#eF3524" />
              <Text className="text-sm text-slate-500">Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
})