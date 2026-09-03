// =====================================================================
// Push notification config (order-status updates).
//
// The app registers an Expo push token on sign-in (pushService.ts) and
// stores it in the Supabase `push_tokens` table. A database trigger +
// edge function (see genumsolutions-website/supabase/order-status-push-
// trigger.sql and functions/push-order-status) sends the notification
// whenever an order status changes.
//
// ⚠️ ACTIVATION — what is still required before pushes can reach a device:
//   1. Firebase Cloud Messaging for the Android build. Create a Firebase
//      project and download `google-services.json`, then place it at
//      mobile/google-services.json and add to app.json:
//        "android": { ..., "googleServicesFile": "./google-services.json" }
//      The APK must then be rebuilt (expo prebuild + gradlew assembleRelease).
//   2. An EAS/Expo project id for token minting. Provide it here (or via
//      the EXPO_PUBLIC_EAS_PROJECT_ID env var), matching the Expo account
//      used to send. Get it from expo.dev → project → Settings.
//   3. Set the edge function secrets EXPO_ACCESS_TOKEN (and optionally
//      PUSH_TRIGGER_SECRET) in the Supabase dashboard.
//
// Until step 2 is configured, getExpoPushToken() below returns null and
// the app simply skips registration — no crash, push stays dormant.
// =====================================================================

export const PUSH_PROJECT_ID =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? ''

// Android notification channel used for order updates. Keep in sync with
// the channelId the push-order-status edge function sends with.
export const PUSH_CHANNEL_ID = 'order-updates'
export const PUSH_CHANNEL_NAME = 'Order updates'
export const PUSH_CHANNEL_DESCRIPTION =
  'Notifications when your order status changes (paid, shipped, cancelled).'
