// =====================================================================
// with-car-network.js
//
// The owner's 2026-09-28 report: the car drives perfectly over Bluetooth but
// "the app and car doesn't connect at all in the wifi connection." The cause
// is this app's own Android manifest, not the firmware:
//
//   1. NO WiFi permissions at all. app.json declared BLUETOOTH_* and
//      location but never ACCESS_WIFI_STATE / CHANGE_WIFI_STATE /
//      ACCESS_NETWORK_STATE, so the app could not even tell the user WHICH
//      network the phone was on, let alone join the car's access point.
//      On Android 13+ (API 33) NEARBY_WIFI_DEVICES is additionally REQUIRED
//      to use WiFi APIs; without it the OS silently withholds the SSID and
//      blocks local-network use.
//
//   2. NO cleartext allowance. The car serves plain HTTP on :80 and a plain
//      `ws://` WebSocket on :81. Android blocks cleartext traffic by default
//      in RELEASE builds, so the app's socket to 192.168.245.1 was refused by
//      the OS while the identical request from Chrome succeeded. That is
//      exactly the "works in a browser, never works in the app" symptom.
//
// Both are manifest-level, so this is a NATIVE change: it reaches devices
// only through a new APK, never through an OTA bundle. Ship with the next
// release build (see AGENTS.md — the release APK is built from C:\bs).
//
// Clearing `usesCleartextTraffic` here is deliberately broad: the app talks
// to owner-operated local hardware on a private network and hosts no
// cleartext endpoint of its own. It can be narrowed to the 192.168.0.0/16
// car subnets later with a network-security-config if that ever matters.
const { withAndroidManifest } = require("expo/config-plugins");

const PERMISSIONS = [
  // Read the current connection type / whether the radio is even on.
  "android.permission.ACCESS_NETWORK_STATE",
  // Read the joined SSID + the local IP (with ACCESS_FINE_LOCATION, which
  // app.json already grants, this is what powers the WiFi test panel).
  "android.permission.ACCESS_WIFI_STATE",
  // Join / leave a network programmatically.
  "android.permission.CHANGE_WIFI_STATE",
  // Android 13+ gate for all of the above.
  "android.permission.NEARBY_WIFI_DEVICES",
];

// Android 13+ requires this flag alongside NEARBY_WIFI_DEVICES, and rejects
// the manifest outright without it. It is only legal on that one permission,
// so it is applied per-permission rather than to the whole list.
const FLAGGED_PERMISSIONS = new Set(["android.permission.NEARBY_WIFI_DEVICES"]);

module.exports = function withCarNetwork(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const usesPermissions = (manifest["uses-permission"] =
      manifest["uses-permission"] || []);

    for (const name of PERMISSIONS) {
      const existing = usesPermissions.find(
        (p) => p.$ && p.$["android:name"] === name,
      );
      if (existing) {
        // Already declared elsewhere (app.json) — but the Android 13 flag must
        // still be there, and app.json cannot express it. Repair in place so
        // a pre-existing entry can never end up flagless, which Android 13+
        // rejects at install time.
        if (FLAGGED_PERMISSIONS.has(name)) {
          existing.$["android:usesPermissionFlags"] = "neverForLocation";
        }
        continue;
      }
      const entry = { $: { "android:name": name } };
      if (FLAGGED_PERMISSIONS.has(name)) {
        entry.$["android:usesPermissionFlags"] = "neverForLocation";
      }
      usesPermissions.push(entry);
    }

    // Let the car be reached over plain HTTP / ws:// on the local network.
    const app = manifest.application && manifest.application[0];
    if (app && app.$) {
      app.$["android:usesCleartextTraffic"] = "true";
    }

    return config;
  });
};
