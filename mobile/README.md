# Genum Solutions Mobile App

Expo (React Native + TypeScript) mobile app for Genum Solutions. Scaffolded to match the
website's branding (colors, fonts, theme tokens) and structured for offline-first auditing,
operations, and employee product edits, plus a BLE robot-car control scaffold.

> Do **not** modify the `genumsolutions-website` repo. All work happens in this `mobile/`
> folder. Secrets are placeholders only.

---

## Run locally

Prerequisites: Node.js, and the Expo tooling.

```bash
npm install          # install dependencies (first time)
npm start            # start Expo dev server (QR code for Expo Go)
npm run android      # open on Android emulator / device
npm run ios          # open on iOS simulator (macOS only)
npm run web          # open in browser
```

You can also use the Expo Go app on a physical phone by scanning the QR code from
`npm start`.

---

## Where to place Supabase keys

Open `mobile/shared/supabase.ts` and replace the placeholders with your project keys
(Supabase → Project Settings → API). Use the bare project URL — do **not** append `/rest/v1/`.

```ts
export const SUPABASE_URL = '<YOUR_SUPABASE_URL>';
export const SUPABASE_ANON_KEY = '<YOUR_SUPABASE_ANON_KEY>';
```

For local development you can keep them in a `mobile/.env` (create it; it is gitignored) and
read them via an env loader, or set them via `EAS` environment variables for builds. **Never
commit real keys.**

---

## BLE build notes (robot car)

`react-native-ble-plx` does **not** run inside Expo Go. To use Bluetooth you must build a
custom development client or use a prebuild:

```bash
npx expo prebuild       # generate native android/ios projects
npx expo run:android    # build + run a dev client with BLE
# or build a dev client via EAS:
npx eas build --profile development --platform android
```

Required native permissions:

- **Android:** `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` (older devices).
- **iOS:** `NSBluetoothAlwaysUsageDescription` usage description.

See `mobile/src/services/BluetoothService.ts` for the scaffold. Replace
`ROBOT_SERVICE_UUID` and `COMMAND_CHARACTERISTIC_UUID` with your robot's actual UUIDs.

---

## Offline sync design

1. **Write offline:** screens persist records locally using
   `src/services/StorageService.ts` (`enqueue`). Records are queued in `AsyncStorage` and
   survive app restarts.
2. **Sync when online:** `src/services/SyncService.ts` listens to connectivity
   (`@react-native-community/netinfo`) and calls `syncAll()` when the network returns,
   upserting each queued record into its Supabase table and removing it on success.
3. **Conflict strategy (notes):** baseline is last-write-wins using an `updated_at` field;
   escalate to per-field merges or a server-side `rev` if edits can collide.

Extend `TABLE_BY_ENTITY` in `SyncService.ts` to map new offline entities to Supabase tables.

---

## Theme / branding alignment

The website's theme tokens were extracted (read-only) into:

- `mobile/tailwind.config.js` — same color/font/radius/shadow tokens as the website.
- `mobile/shared/theme.ts` — the same tokens as plain TypeScript for use in styles/JS.

Fonts (Inter for body, Sora for headings) must be bundled with `expo-font` for a finalized
build; see the TODO markers in `shared/theme.ts`. High-res logos should be placed in
`mobile/assets/` and referenced from `shared/theme.ts` (`assets.logo`).
