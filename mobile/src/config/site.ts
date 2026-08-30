// =====================================================================
// Site config - the website the app mirrors as a full-screen WebView.
//
// Point WEBSITE_URL at the live site by default. To develop against the
// local server, switch it to http://<your-pc-ip>:3000 (phone and PC on
// the same network) - mirroring stays identical either way.
// =====================================================================
export const WEBSITE_URL = 'https://genumsolutions-website.vercel.app';

// Display version for the app (Drawer -> "App v…"). Keep in sync with
// "version" in ../app.json and bump BOTH on every release (version + android
// .versionCode must increase) so installs update over-the-top.
export const APP_VERSION = '1.3.1';