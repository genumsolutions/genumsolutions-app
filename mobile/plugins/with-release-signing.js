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

    if (!src.includes("signingConfigs {") && src.includes('compileSdk rootProject.ext.compileSdkVersion')) {
      src = src.replace(
        /^    compileSdk rootProject\.ext\.compileSdkVersion/m,
        '    compileSdk rootProject.ext.compileSdkVersion\n' + SIGNING_CONFIGS_BLOCK
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
