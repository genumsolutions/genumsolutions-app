// =====================================================================
// with-install-permission.js
//
// The app self-updates by downloading its release APK and handing it to
// the Android package installer via a content:// URI. On Android 8.0+
// (API 26+) an app needs android.permission.REQUEST_INSTALL_PACKAGES to
// launch the installer for an APK. This plugin injects that permission
// into AndroidManifest.xml during `expo prebuild` so the native manifest
// always carries it (prebuild regenerates the manifest from scratch).
// =====================================================================
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withInstallPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const usesPermissions = (manifest['uses-permission'] = manifest['uses-permission'] || []);

    const hasInstallPermission = usesPermissions.some(
      (p) =>
        p.$ &&
        p.$['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES',
    );

    if (!hasInstallPermission) {
      usesPermissions.push({
        $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' },
      });
    }

    return config;
  });
};
