// =====================================================================
// pushService — registers the device for order-status push notifications.
//
// Flow: request permissions -> create the Android channel -> obtain an
// Expo push token -> upsert it into Supabase `push_tokens` (RLS allows
// each user to manage only their own rows). Called on sign-in / app
// launch; tokens are removed on sign-out.
//
// Everything is guarded: if push is not configured yet (no EAS project id,
// no permission granted, native module missing in Expo Go on some
// platforms) the calls resolve to a no-op instead of throwing, so the rest
// of the app is unaffected. See src/config/push.ts for activation steps.
// =====================================================================
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { supabase, supabaseConfigured } from '../config/supabase'
import {
  PUSH_PROJECT_ID,
  PUSH_CHANNEL_ID,
  PUSH_CHANNEL_NAME,
  PUSH_CHANNEL_DESCRIPTION,
} from '../config/push'

if (Platform.OS !== 'web') {
  // expo-notifications has no web handler module; a module-scope call throws
  // UnavailabilityError on web and white-screens the app. Native-only.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

/** Android channel for order updates (safe no-op elsewhere / when missing). */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: PUSH_CHANNEL_NAME,
      description: PUSH_CHANNEL_DESCRIPTION,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    })
  } catch {
    /* channel API unavailable — ignore */
  }
}

/**
 * True when this device can receive remote pushes and the user allowed it.
 * Never throws.
 */
export async function pushPermissionGranted(): Promise<boolean> {
  try {
    if (!Device.isDevice) {
      // Simulators can't receive remote push (Android emulators can via a
      // special FCM setup, but we don't support that here).
      return false
    }
    await ensureChannel()
    const existing = await Notifications.getPermissionsAsync()
    if (existing.granted) return true
    if (!existing.canAskAgain) return false
    const asked = await Notifications.requestPermissionsAsync()
    return asked.granted
  } catch {
    return false
  }
}

/**
 * Returns the device's Expo push token, or null when push is not yet
 * configured (missing PUSH_PROJECT_ID / permission / native module).
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (!PUSH_PROJECT_ID) {
      console.warn(
        '[push] inactive: no Expo project id. Set EXPO_PUBLIC_EAS_PROJECT_ID or app.json extra.eas.projectId (see src/config/push.ts).',
      )
      return null
    }
    const granted = await pushPermissionGranted()
    if (!granted) return null
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: PUSH_PROJECT_ID,
    })
    return token?.data ?? null
  } catch (e) {
    console.warn('[push] token request skipped:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Registers the current device token for `userId` (upsert, one row per
 * user+token). No-op when push is unconfigured or the store is unreachable.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (!supabaseConfigured || !userId) return
  try {
    const token = await getExpoPushToken()
    if (!token) return
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    )
  } catch (e) {
    console.warn('[push] register skipped:', e instanceof Error ? e.message : e)
  }
}

/** Removes every stored token for `userId` (called on sign-out). */
export async function removePushTokens(userId: string): Promise<void> {
  if (!supabaseConfigured || !userId) return
  try {
    await supabase.from('push_tokens').delete().eq('user_id', userId)
  } catch {
    /* best-effort */
  }
}
