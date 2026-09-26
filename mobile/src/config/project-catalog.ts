// =====================================================================
// project-catalog.ts - project categories for the GENUM app.
// Mirrors the website's lib/project-catalog.ts for the IoT &
// Remote Controller hub selector (robo-car, home-automation,
// smart-farm, smart-city, drones).
// =====================================================================

export type ControlCapability =
  | "directional"
  | "servo"
  | "pid"
  | "start-stop"
  | "relay"
  | "sensor"
  | "weblink"
  | "slider"
  | "gimbal"
  | "altitude";

export type ProjectCategory = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** A1 (2026-09-24): per-category admin labels from project_categories.capability_labels
   *  (e.g. relay → "Pump control"). Screens fall back to their static maps when absent. */
  capabilityLabels?: Record<string, string>;
  hardware: string[];
  capabilities: ControlCapability[];
  carType?: string;
};

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  {
    slug: "robocar",
    name: "Robo Car",
    tagline: "Drive robot cars with two joysticks, like the hand-held remote.",
    description:
      "Connect a BLE or WiFi car and drive it with the virtual joysticks and Select / Back buttons.",
    hardware: [
      "ESP32",
      "BO / brushed motors",
      "Servo",
      "MPU6050",
      "HC-SR04 / IR",
    ],
    capabilities: [
      "directional",
      "servo",
      "pid",
      "start-stop",
      "weblink",
      "slider",
    ],
    carType: "4wd4m",
  },
  {
    slug: "home-automation",
    // U-47 (owner): renamed from "Home Automation" — slug kept for routing.
    name: "Smart Home",
    tagline: "Flip relays, switches, and read sensors around the home.",
    description:
      "Control lights, fans, relays, and sensors using ESP32/ESP8266.",
    hardware: [
      "ESP32 / ESP8266",
      "Relay modules",
      "DHT / BME sensors",
      "IR & motion detect",
    ],
    capabilities: ["relay", "sensor", "slider"],
  },
  {
    slug: "smart-farm",
    name: "Smart Farm",
    tagline: "Pumps, solenoids, and soil sensors for automation.",
    description: "Automate irrigation and soil monitoring.",
    hardware: [
      "ESP32",
      "Soil moisture sensors",
      "Water pumps / solenoids",
      "Relays & PSUs",
    ],
    capabilities: ["relay", "sensor", "slider"],
  },
  {
    slug: "smart-city",
    name: "Smart City",
    tagline: "Lighting, parking, and environment monitoring prototypes.",
    description:
      "Street lighting, parking sensing, and air-quality monitoring.",
    hardware: [
      "ESP32",
      "Ambient air sensors",
      "Ultrasonic / IR",
      "NeoPixel / LED arrays",
    ],
    capabilities: ["relay", "sensor", "slider"],
  },
  {
    slug: "drones",
    // U-47 (owner): renamed to match the projects-page category.
    name: "Aerial Drones",
    tagline: "Flight-controller and telemetry builds.",
    description:
      "Flight-controller setup, motor/ESC integration, and telemetry links.",
    hardware: [
      "ESP32 / STM32",
      "Flight cameras",
      "ESC + brushless motors",
      "GPS & IMU",
    ],
    capabilities: ["sensor", "slider", "gimbal", "altitude"],
    carType: "drone",
  },
  // U-47 (owner, 2026-09-27): the two single-project categories join the
  // Control Panel so EVERY project category has its own remote window.
  {
    slug: "smart-dustbin",
    name: "Smart Dustbin",
    tagline: "Open the lid, watch the fill level.",
    description:
      "Ultrasonic lid control, fill-level telemetry, and compactor switching.",
    hardware: ["ESP32", "Ultrasonic sensor", "Servo lid", "Relay compactor"],
    capabilities: ["relay", "sensor", "slider"],
  },
  {
    slug: "remote-controller",
    name: "Remote Controller",
    tagline: "The ESP32 hand-held, mirrored on screen.",
    description:
      "Battery and signal readouts, output channels, and throttle/steer curves.",
    hardware: ["ESP32", "NRF24L01", "Joystick module"],
    capabilities: ["relay", "sensor", "slider"],
  },
];

export function getProjectCategory(slug: string): ProjectCategory | undefined {
  return PROJECT_CATEGORIES.find((c) => c.slug === slug);
}

// Maps the product.category values from Supabase (e.g. 'Robot Cars')
// to the PROJECT_CATEGORIES slugs used by the Control Panel.
export const PRODUCT_CATEGORY_TO_SLUG: Record<string, string> = {
  "Robot Cars": "robocar",
  "Home Automation": "home-automation",
  "Smart Farm": "smart-farm",
  "Smart City": "smart-city",
  "Drones & Aerial": "drones",
  Drones: "drones",
  "Pre-packaged Kits": "robocar",
  // U-47: the new single-project categories (project_category NAME → slug).
  "Smart Dustbin": "smart-dustbin",
  "Remote Controller": "remote-controller",
  "Smart Home": "home-automation",
  "Aerial Drones": "drones",
};
