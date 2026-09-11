// =====================================================================
// controlConstants — shared tunable constants for the IoT Control hub.
// Kept together so ToolsScreen and the RemoteControl window never drift
// on drive cadence / reconnect behaviour.
// =====================================================================

// Continuous drive sends mirror the physical remote's DRIVE_RESEND_MS = 30
// (config.h) — the hold-resend cadence for direction/SPD/SERVO streams.
export const DRIVE_CMD_MIN_INTERVAL_MS = 30

export const WIFI_RECONNECT_DELAY_MS = 3000
export const WIFI_MAX_RECONNECT_ATTEMPTS = 5

// SPP auto-reconnect — industry-standard silent exponential backoff.
// Delays: 1s → 2s → 4s → 8s → give up (no prompt, fully silent).
export const SPP_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000]
