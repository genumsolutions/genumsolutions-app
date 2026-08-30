// =====================================================================
// deviceCatalog.ts - single source of truth for the "IoT & Remote
// Controller" project categories in the app (native side).
//
// Mirrors the website's lib/project-catalog.ts conceptually. Each repo
// keeps its own copy because web (Next.js) and native (React Native)
// cannot share a module, but the content is defined ONCE here and every
// native surface (the IoT & Remote Controller screen, the Drawer) reads
// from it.
// =====================================================================

export type NativeControlKind =
  | 'relay' // on/off switch outputs
  | 'sensor' // live telemetry readout
  | 'slider' // 0..n level control
  | 'joystick' // directional drive (robocar)
  | 'servo' // steering servo (robocar 2WD1M)
  | 'pid' // PID tuning (robocar self-balancing)

export type NativeCategory = {
  slug: string
  name: string
  tagline: string
  description: string
  controls: NativeControlKind[]
  /** Number of relay outputs for relay categories. */
  relays?: number
  /** robo-car mode id when this category is a car (see roboCarCatalog). */
  carType?: string
}

export const NATIVE_CATEGORIES: NativeCategory[] = [
  {
    slug: 'robocar',
    name: 'Robo Car',
    tagline: 'Drive robot cars with two joysticks, like the hand-held remote.',
    description:
      'Choose a mode, connect a BLE or WiFi car, and drive with the virtual joysticks and Select / Back buttons.',
    controls: ['joystick', 'servo', 'pid', 'slider'],
    carType: '4wd4m',
  },
  {
    slug: 'home-automation',
    name: 'Home Automation',
    tagline: 'Flip relays, switches, and read sensors around the home.',
    description: 'Toggle lights, fans, and relays, and read temperature and motion sensors.',
    controls: ['relay', 'sensor', 'slider'],
    relays: 4,
  },
  {
    slug: 'smart-farm',
    name: 'Smart Farm',
    tagline: 'Pumps, solenoids, and soil sensors for automation.',
    description: 'Toggle pumps and solenoids, and read soil moisture and ambient sensors.',
    controls: ['relay', 'sensor', 'slider'],
    relays: 4,
  },
  {
    slug: 'smart-city',
    name: 'Smart City',
    tagline: 'Lighting, parking, and environment monitoring prototypes.',
    description: 'Control outputs and read environment sensors for city-scale prototypes.',
    controls: ['relay', 'sensor', 'slider'],
    relays: 4,
  },
  {
    slug: 'drones',
    name: 'Drones & Aerial',
    tagline: 'Flight-controller and telemetry builds.',
    description: 'Flight-controller setup, motor/ESC integration, and telemetry links.',
    controls: ['sensor', 'slider'],
  },
]

export function getNativeCategory(slug: string): NativeCategory | undefined {
  return NATIVE_CATEGORIES.find((c) => c.slug === slug)
}
