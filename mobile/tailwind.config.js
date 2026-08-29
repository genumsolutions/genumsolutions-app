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
        ink: '#0f172a',
        navy: '#1e3a8a',
        'navy-dark': '#172554',
        'navy-light': '#dbe4f8',
        sky: '#e3eaf7',
        mist: '#f8fafc',
        gold: '#b45309',
        'gold-dark': '#92400e',
        line: '#e2e8f0',
        border: '#94a3b8',
        surface: '#ffffff',
        muted: '#64748b',
        accent: '#059669',
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
