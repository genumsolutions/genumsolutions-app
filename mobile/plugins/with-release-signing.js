// =====================================================================
// with-release-signing.js
//
// `expo prebuild` regenerates android/, so any hand edit made directly to
// android/app/build.gradle (the release signing config) is wiped on the next
// prebuild. This plugin re-applies that signing configuration on every
// prebuild so the release build is reproducible.
//
// Credentials come from ../keystores/keystore.properties (gitignored). When
// the file is missing the plugin keeps the stock debug signing so the project
// still builds on machines that don't hold the release keystore.
// =====================================================================
const { withAppBuildGradle } = require('expo/config-plugins');

// These lines must sit directly above `android {` in the generated build.gradle.
const PREAMBLE_ABOVE_ANDROID = `
// ---------------------------------------------------------------------------
// Release signing - credentials come from ../keystores/keystore.properties
// which is GITIGNORED (see mobile/.gitignore). If the file is missing the
// release build falls back to the debug key so the project still builds on
// machines that don't hold the release keystore.
// ---------------------------------------------------------------------------
def keystorePropertiesFile = rootProject.file("../keystores/keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
`;

// Injected after `compileSdk rootProject.ext.compileSdkVersion` (inside `android {`),
// before `defaultConfig`. Ships an arm64-only APK (small download, virtually every
// phone in 2026 is arm64) so `expo prebuild` produces the SAME light build we release,
// instead of building every ABI (slow / resource-hungry on CI).
const ABI_SPLITS_BLOCK = `
    // Ship a trimmed arm64-only APK for the website download (small download,
    // virtually every phone in 2026 is arm64).
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "arm64-v8a"
        }
    }
`;

// Injected right after `android {` and the ndk/buildTools/compileSdk line, inside
// a fresh `signingConfigs { ... }` block.
const SIGNING_CONFIGS_BLOCK = `
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        if (keystorePropertiesFile.exists()) {
            release {
                if (keystoreProperties.getProperty('storeFile')) {
                    storeFile file(keystoreProperties['storeFile'])
                    storePassword keystoreProperties['storePassword']
                    keyAlias keystoreProperties['keyAlias']
                    keyPassword keystoreProperties['keyPassword']
                }
            }
        }
    }
`;

// Inside the `release { }` buildType, wire up the release (or debug fallback) key.
const RELEASE_SIGNING_CONFIG = `
            // Uses the release keystore when present, otherwise the debug key.
            // Caution! In production, generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            } else {
                signingConfig signingConfigs.debug
            }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    // Idempotent: never double-apply if prebuild runs twice.
    if (!src.includes('keystorePropertiesFile = rootProject.file')) {
      src = src.replace(
        /^android \{/m,
        PREAMBLE_ABOVE_ANDROID + '\nandroid {'
      );
    }

    if (!src.includes('compileSdk rootProject.ext.compileSdkVersion')) {
      return cfg;
    }

    // Inject the arm64-only ABI split right after the compileSdk line.
    if (!src.includes('include "arm64-v8a"')) {
      src = src.replace(
        /(^[ \t]*compileSdk rootProject\.ext\.compileSdkVersion\r?\n)/m,
        '$1' + ABI_SPLITS_BLOCK
      );
    }

    if (!src.includes('signingConfigs.release') && src.includes('compileSdk rootProject.ext.compileSdkVersion')) {
      // Replace the existing signingConfigs block (which only has debug) with one that also has release.
      src = src.replace(
        /signingConfigs \{[\s\S]*?\n    \}/m,
        SIGNING_CONFIGS_BLOCK.trim()
      );
    }

    if (!src.includes('Uses the release keystore when present, otherwise the debug key') && src.includes('proguardFiles getDefaultProguardFile')) {
      src = src.replace(
        /(^.*minifyEnabled enableMinifyInReleaseBuilds\r?\n)/m,
        RELEASE_SIGNING_CONFIG + '$1'
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
