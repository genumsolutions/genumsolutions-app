// =====================================================================
// deviceMemoryService - saves/loads device configurations per device address.
// Uses AsyncStorage to persist: speed, mode, steer limit, trim, PID values,
// etc. so the app opens in the previous state on next connect.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CarMode, type CarModeId } from '../config/roboCarCatalog'

const STORAGE_PREFIX = '@genum_device_'

export interface DeviceMemory {
  /** Device MAC address (key) */
  address: string
  /** Device name (for display) */
  name: string
  /** Last connected timestamp */
  lastConnected: number
  /** Last used mode ID */
  modeId: CarModeId
  /** Last speed value */
  speed: number
  /** 2WD1M: steering limit (0-180) */
  steerLimit: number
  /** 2WD1M: steering trim (-90 to 90) */
  trim: number
  /** Self-balancing: PID values */
  pidKp?: number
  pidKi?: number
  pidKd?: number
  pidOut?: number
  pidOff?: number
  /** Custom settings per device type */
  settings: Record<string, unknown>
}

const DEFAULT_MEMORY: Omit<DeviceMemory, 'address' | 'name' | 'lastConnected'> = {
  modeId: '2wd1m',
  speed: 170,
  steerLimit: 90,
  trim: 0,
  pidKp: 12.0,
  pidKi: 3.0,
  pidKd: 1.0,
  pidOut: 0,
  pidOff: 0,
  settings: {},
}

/** Get storage key for a device address */
function getKey(address: string): string {
  return `${STORAGE_PREFIX}${address}`
}

/** Load device memory from storage, or create default */
export async function loadDeviceMemory(address: string, name: string): Promise<DeviceMemory> {
  try {
    const json = await AsyncStorage.getItem(getKey(address))
    if (json) {
      const stored = JSON.parse(json) as Partial<DeviceMemory>
      return {
        address,
        name,
        lastConnected: Date.now(),
        ...DEFAULT_MEMORY,
        ...stored,
        settings: { ...DEFAULT_MEMORY.settings, ...(stored.settings || {}) },
      }
    }
  } catch {
    // Storage error - return default
  }
  return {
    address,
    name,
    lastConnected: Date.now(),
    ...DEFAULT_MEMORY,
  }
}

/** Save device memory to storage */
export async function saveDeviceMemory(memory: DeviceMemory): Promise<void> {
  try {
    await AsyncStorage.setItem(getKey(memory.address), JSON.stringify({
      address: memory.address,
      name: memory.name,
      lastConnected: Date.now(),
      modeId: memory.modeId,
      speed: memory.speed,
      steerLimit: memory.steerLimit,
      trim: memory.trim,
      pidKp: memory.pidKp,
      pidKi: memory.pidKi,
      pidKd: memory.pidKd,
      pidOut: memory.pidOut,
      pidOff: memory.pidOff,
      settings: memory.settings,
    }))
  } catch {
    // Storage error - ignore
  }
}

/** Get all saved device addresses (for device history) */
export async function getAllSavedDeviceAddresses(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const deviceKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX))
    return deviceKeys.map(k => k.replace(STORAGE_PREFIX, ''))
  } catch {
    return []
  }
}

/** Delete device memory (e.g., when user removes device) */
export async function deleteDeviceMemory(address: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(getKey(address))
  } catch {
    // Ignore
  }
}
