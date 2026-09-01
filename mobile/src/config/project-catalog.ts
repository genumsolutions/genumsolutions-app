// =====================================================================
// project-catalog.ts - project categories for the GENUM app.
// Mirrors the website's lib/project-catalog.ts for the IoT &
// Remote Controller hub selector (robo-car, home-automation,
// smart-farm, smart-city, drones).
// =====================================================================

export type ControlCapability =
  | 'directional'
  | 'servo'
  | 'pid'
  | 'start-stop'
  | 'relay'
  | 'sensor'
  | 'weblink'
  | 'slider'

export type ProjectCategory = {
  slug: string
  name: string
  tagline: string
  description: string
  hardware: string[]
  capabilities: ControlCapability[]
  carType?: string
}

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  {
    slug: 'robocar',
    name: 'Robo Car',
    tagline: 'Drive robot cars with two joysticks, like the hand-held remote.',
    description: 'Connect a BLE or WiFi car and drive it with the virtual joysticks and Select / Back buttons.',
    hardware: ['ESP32', 'BO / brushed motors', 'Servo', 'MPU6050', 'HC-SR04 / IR'],
    capabilities: ['directional', 'servo', 'pid', 'start-stop', 'weblink', 'slider'],
    carType: '4wd4m',
  },
  {
    slug: 'home-automation',
    name: 'Home Automation',
    tagline: 'Flip relays, switches, and read sensors around the home.',
    description: 'Control lights, fans, relays, and sensors using ESP32/ESP8266.',
    hardware: ['ESP32 / ESP8266', 'Relay modules', 'DHT / BME sensors', 'IR & motion detect'],
    capabilities: ['relay', 'sensor', 'slider'],
  },
  {
    slug: 'smart-farm',
    name: 'Smart Farm',
    tagline: 'Pumps, solenoids, and soil sensors for automation.',
    description: 'Automate irrigation and soil monitoring.',
    hardware: ['ESP32', 'Soil moisture sensors', 'Water pumps / solenoids', 'Relays & PSUs'],
    capabilities: ['relay', 'sensor', 'slider'],
  },
  {
    slug: 'smart-city',
    name: 'Smart City',
    tagline: 'Lighting, parking, and environment monitoring prototypes.',
    description: 'Street lighting, parking sensing, and air-quality monitoring.',
    hardware: ['ESP32', 'Ambient air sensors', 'Ultrasonic / IR', 'NeoPixel / LED arrays'],
    capabilities: ['relay', 'sensor', 'slider'],
  },
  {
    slug: 'drones',
    name: 'Drones & Aerial',
    tagline: 'Flight-controller and telemetry builds.',
    description: 'Flight-controller setup, motor/ESC integration, and telemetry links.',
    hardware: ['ESP32 / STM32', 'Flight cameras', 'ESC + brushless motors', 'GPS & IMU'],
    capabilities: ['sensor', 'slider'],
  },
]

export function getProjectCategory(slug: string): ProjectCategory | undefined {
  return PROJECT_CATEGORIES.find((c) => c.slug === slug)
}