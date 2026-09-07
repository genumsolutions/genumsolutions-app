// =====================================================================
// controlConstants — shared tunable constants for the IoT Control hub.
// Kept together so ToolsScreen and the RemoteControl window never drift
// on drive cadence / reconnect behaviour.
// =====================================================================

// Continuous drive sends mirror the physical remote's ~30ms resend cadence.
export const DRIVE_CMD_MIN_INTERVAL_MS = 50

export const WIFI_RECONNECT_DELAY_MS = 3000
export const WIFI_MAX_RECONNECT_ATTEMPTS = 5
