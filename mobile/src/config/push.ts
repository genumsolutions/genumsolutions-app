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
//   2. An EAS/Expo project id for token minting. The project id is read
//      from the EXPO_PUBLIC_EAS_PROJECT_ID env var, falling back to the
//      `extra.eas.projectId` declared in app.json (the single source of
//      truth per AGENTS.md). Get it from expo.dev → project → Settings.
//   3. Set the edge function secrets EXPO_ACCESS_TOKEN (and optionally
//      PUSH_TRIGGER_SECRET) in the Supabase dashboard.
//
// Until Firebase (step 1) is configured, delivery stays dormant; the app
// will still register its token row so the activation gap is visible.
// =====================================================================

import Constants from "expo-constants";

const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId ?? "";

/** Env var wins; otherwise fall back to the app.json declared project id. */
export function resolvePushProjectId(
  envProjectId: string | undefined,
  appJsonProjectId: string,
): string {
  return envProjectId || appJsonProjectId;
}

export const PUSH_PROJECT_ID = resolvePushProjectId(
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  EAS_PROJECT_ID,
);

// Android notification channel used for order updates. Keep in sync with
// the channelId the push-order-status edge function sends with.
export const PUSH_CHANNEL_ID = "order-updates";
export const PUSH_CHANNEL_NAME = "Order updates";
export const PUSH_CHANNEL_DESCRIPTION =
  "Notifications when your order status changes (paid, shipped, cancelled).";
