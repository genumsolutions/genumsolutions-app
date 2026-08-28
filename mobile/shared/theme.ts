// =====================================================================
// Shared theme tokens for the Genum Solutions mobile app.
//
// Extracted (READ-ONLY) from genumsolutions-website:
//   - colors : website/tailwind.config.ts:12-26 and app/globals.css:4-10
//   - fonts  : website/tailwind.config.ts:27-31 (loaded via next/font/google,
//              website/app/layout.tsx:11-12)
//   - assets : website/public/logo.png, icon-32/192/512, apple-touch-icon.png
// ---------------------------------------------------------------------
// TODO (placeholders you must fill — do NOT edit the website repo):
//   - Bundle the actual font files (Inter, Sora) with expo-font, then point
//     `heading`/'body' below at the loaded font family names.
//   - Drop the high-res logo file into mobile/assets/ and set `logo` below.
// =====================================================================

export const colors = {
  // Primary brand color (site theme-color + primary button bg)
  primary: '#1e3a8a', // navy
  secondary: '#b45309', // gold
  primaryDark: '#172554', // navy-dark
  primaryLight: '#dbe4f8', // navy-light
  sky: '#e3eaf7',
  mist: '#f8fafc', // app background (globals.css body bg)
  secondaryDark: '#92400e', // gold-dark
  ink: '#0f172a', // body text
  line: '#e2e8f0', // borders
  border: '#94a3b8',
  surface: '#ffffff',
  muted: '#64748b',
  accent: '#059669', // success / positive
  // CSS variables from globals.css:4-10
  brandNavy: '#1e3a8a',
  brandNavyDark: '#172554',
  brandGold: '#b45309',
  brandPaper: '#f8fafc',
};

// Fonts (see README for how to load with expo-font in RN/Expo)
export const fonts = {
  body: 'Inter', // PLAYLACEHOLDER: set to the runtime-loaded font family name
  heading: 'Sora', // PLAYLACEHOLDER: set to the runtime-loaded font family name
  mono: 'ui-monospace',
};

// Brand assets (filenames + intended path in mobile/assets/)
export const assets = {
  logo: 'assets/logo.png', // PLAYLACEHOLDER: upload website/public/logo.png here
  icon: 'assets/icon.png', // template default
};

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  default: 8,
};

export const brand = {
  name: 'GENUM SOLUTIONS',
  tagline: 'Build what matters',
};
