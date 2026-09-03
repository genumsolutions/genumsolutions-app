// =====================================================================
// carModeStorage - AsyncStorage persistent store for car modes.
//
// Keeps a cached copy of the car-mode catalogue so the app can render
// mode information offline. The cache is refreshed from the shared
// `robo_car_modes` Supabase table (DB-first, via services/carModeService)
// whenever the app comes back online; the bundled config/roboCarCatalog.ts
// is the ultimate offline fallback.
//
// NOTE: the protocol helpers below (resolveModeByToken/Index, nextMode)
// stay bound to the bundled 9 firmware modes - the ESP32 firmware only
// understands those fixed tokens. The display catalogue is the DB-first one.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_CAR_MODES, type CarMode, type CarModeId } from '../config/roboCarCatalog'
import { resolveModeByToken, resolveModeByIndex, nextMode } from '../config/roboCarCatalog'
import { getCarModes } from './carModeService'

const CACHE_KEY = 'genum_car_modes_v1'

// -------------------------------------------------------------------
// Load car modes from AsyncStorage. Falls back to the hard-coded
// LOCAL_CAR_MODES if nothing is stored yet or the data is corrupt.
// -------------------------------------------------------------------
export async function loadCarModes(): Promise<CarMode[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate that the stored modes have the required fields
        const valid = parsed.filter(
          (m: unknown) => m && typeof m === 'object' && 'id' in m && 'name' in m
        )
        if (valid.length > 0) return valid as CarMode[]
      }
    }
  } catch (e) {
    /* AsyncStore failures must not break the app */
  }
  // Return the master copy as fallback
  return LOCAL_CAR_MODES
}

// -------------------------------------------------------------------
// Save car modes to AsyncStorage. Meant to be called when the app
// comes back online and successfully fetches fresh data from the website.
// -------------------------------------------------------------------
export async function saveCarModes(modes: CarMode[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(modes))
  } catch (e) {
    /* Storage failures must not block the app */
  }
}

// -------------------------------------------------------------------
// Get a single mode by its token (as sent over BLE/WS protocol)
// -------------------------------------------------------------------
export function getModeByToken(token: string): CarMode | undefined {
  return resolveModeByToken(token)
}

// -------------------------------------------------------------------
// Get a mode by its device index in the firmware cycle (0..8)
// -------------------------------------------------------------------
export function getModeByIndex(idx: number): CarMode | undefined {
  return resolveModeByIndex(idx)
}

// -------------------------------------------------------------------
// Get the next mode in the firmware cycle after `from`
// -------------------------------------------------------------------
export function getNextMode(from: CarMode): CarMode {
  return nextMode(from)
}

// -------------------------------------------------------------------
// Legacy compatibility: resolve a mode by the single-character token
// that the firmware sends (BT, 2WD1M, AUTO, PATH, OBS_US, OBS_IR, MAN, ESP_CLI)
// -------------------------------------------------------------------
export function legacyResolveToken(token: string): CarMode | undefined {
  // Try the new mapping first, then fall back to direct name match
  return resolveModeByToken(token) || LOCAL_CAR_MODES.find((m) => m.token === token.toUpperCase())
}

// -------------------------------------------------------------------
// Sync car modes from the shared Supabase table when online.
// Returns the DB-first catalogue and refreshes the AsyncStorage cache;
// falls back to the local cache / bundled list on any failure.
// -------------------------------------------------------------------
export async function syncCarModesFromWebsite(): Promise<CarMode[]> {
  try {
    const modes = await getCarModes()
    if (modes.length > 0) await saveCarModes(modes)
    return modes
  } catch (e) {
    console.error('Failed to sync car modes from Supabase', e)
    return loadCarModes()
  }
}