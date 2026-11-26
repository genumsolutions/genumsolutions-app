// =====================================================================
// Site config - app version, branding and the public storefront URL.
// The app itself is fully native and talks to the shared Supabase database;
// SITE_URL exists only for the admin's "open the real page" actions, which
// need an ABSOLUTE url because the system browser cannot resolve a relative
// one (a bug that silently opened nothing on device).
// =====================================================================

// Display version for the app (menu -> "App v…"). Keep in sync with
// "version" in ../app.json and bump BOTH on every release (version + android
// .versionCode must increase) so installs update over-the-top.
export const APP_VERSION = "4.0.1";

/** Public storefront, used for previews/links opened outside the app. */
export const SITE_URL = "https://genumsolutions-website.vercel.app";

// Bundled fallback hero content shown when the live site-content endpoint is
// unreachable (no network, edge function undeployed, etc.). Staff can still
// edit and save the real content from the Content tab once the endpoint is back.
export const BUNDLED_HERO_TITLE = "Technology you can touch, test, and trust.";
export const BUNDLED_HERO_BODY =
  "Robotics kits, project solutions, fabrication, open tools, and training — built in Nepal for hobbyists, students, and small manufacturers.";
// ci trigger
// ci trigger
