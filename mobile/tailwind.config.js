/** @type {import('tailwindcss').Config} */
// Theme tokens copied from genumsolutions-website/tailwind.config.ts (READ-ONLY source)
// so the mobile app matches the website's branding. Do not modify the website file.
module.exports = {
  // content: adapt to mobile source paths only (website -> mobile)
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ---- extracted from website tailwind.config.ts:12-26 ----
        // Values come from CSS variables (global.css) so NativeWind can flip
        // them at runtime when the app color scheme changes (manual theme
        // toggle calls Appearance.setColorScheme). Light + dark are defined in
        // global.css under :root and @media (prefers-color-scheme: dark).
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        navy: 'rgb(var(--color-navy) / <alpha-value>)',
        'navy-dark': 'rgb(var(--color-navy-dark) / <alpha-value>)',
        'navy-light': 'rgb(var(--color-navy-light) / <alpha-value>)',
        sky: 'rgb(var(--color-sky) / <alpha-value>)',
        mist: 'rgb(var(--color-mist) / <alpha-value>)',
        gold: 'rgb(var(--color-gold) / <alpha-value>)',
        'gold-dark': 'rgb(var(--color-gold-dark) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
      },
      fontFamily: {
        // ---- extracted from website tailwind.config.ts:27-31 ----
        // NOTE: fonts must be installed/bundled in the mobile app (see README)
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 1px 3px -1px rgba(15, 23, 42, 0.1)',
        glow: '0 0 0 1px rgba(30, 58, 138, 0.5), 0 4px 6px -1px rgba(15, 23, 42, 0.1)',
        neon: '0 0 30px rgba(30, 58, 138, 0.22), 0 0 0 1px rgba(30, 58, 138, 0.1)',
      },
    },
  },
  plugins: [],
};
