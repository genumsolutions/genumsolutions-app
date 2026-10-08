// =====================================================================
// controlConstants — shared tunable constants for the IoT Control hub.
// Kept together so ToolsScreen and the RemoteControl window never drift
// on drive cadence / reconnect behaviour.
// =====================================================================

// Continuous drive sends mirror the physical remote's DRIVE_RESEND_MS = 30
// (config.h) — the hold-resend cadence for direction/SPD/SERVO streams.
export const DRIVE_CMD_MIN_INTERVAL_MS = 30;

/**
 * U-97 (bluetooth lag): the fastest the UI repaints on incoming car telemetry.
 * The car streams `/status` frames near frame-rate; applying every one of them
 * re-rendered the whole Control panel (and the drive deck) far faster than the
 * eye can read, which is the "laggy and unresponsive" report — worst when a
 * second link (the local network) is live and both feeds are arriving. ~15 Hz
 * keeps the readings live while capping the re-render cost.
 */
export const TELEMETRY_FLUSH_MS = 66;

export const WIFI_RECONNECT_DELAY_MS = 3000;
export const WIFI_MAX_RECONNECT_ATTEMPTS = 5;

// SPP auto-reconnect — industry-standard silent exponential backoff.
// Delays: 1s → 2s → 4s → 8s → give up (no prompt, fully silent).
export const SPP_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];
