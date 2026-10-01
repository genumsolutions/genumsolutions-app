// =====================================================================
// carModeService - reads the shared `robo_car_modes` Supabase table (the
// SAME table the website's content-store reads and its admin edits) so
// the app's IoT & Remote Controller shows the same catalogue the website
// manages. Falls back to the bundled config/roboCarCatalog.ts when
// Supabase is not configured or unreachable.
//
// This service feeds the DISPLAY catalogue (mode chips, mode info). The
// firmware command protocol (tokens, device_index cycle, resolveModeBy*
// helpers in config/roboCarCatalog.ts) stays bound to the 9 firmware
// modes - the ESP32 firmware only understands those fixed tokens.
//
// RLS: robo_car_modes has a public-read policy, so the app's anon key can
// SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from "../config/supabase";
import {
  LOCAL_CAR_MODES,
  PLANNED_MODE_IDS,
  type CarMode,
  type CarModeId,
  type ControlKind,
} from "../config/roboCarCatalog";

type CarModeRow = {
  id: string;
  name: string | null;
  token: string | null;
  device_index: number | null;
  car: string | null;
  wheel: string | null;
  steering: string | null;
  sensors: unknown;
  transport: unknown;
  remote_with: string | null;
  controls: unknown;
  requires_connection: boolean | null;
  blurb: string | null;
};

const TRANSPORTS = ["ble", "wifi", "classic-bt", "rf"] as const;
const CONTROL_KINDS: ControlKind[] = [
  "drive-tank",
  "drive-2wd1m",
  "pid-auto",
  "start-stop",
  "tuning",
  "weblink",
];

/** sensors/transport/controls are TEXT columns holding JSON arrays. */
function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row: CarModeRow): CarMode | null {
  if (!row.id || !row.name || !row.token) return null;
  return {
    id: row.id as CarModeId,
    name: row.name,
    token: row.token,
    deviceIndex: Number(row.device_index ?? 0),
    car: row.car ?? "",
    wheel: row.wheel ?? "",
    steering: row.steering ?? "",
    sensors: parseList(row.sensors),
    transport: parseList(row.transport).filter(
      (t): t is (typeof TRANSPORTS)[number] =>
        (TRANSPORTS as readonly string[]).includes(t),
    ),
    remoteWith: row.remote_with ?? "",
    controls: parseList(row.controls).filter((c): c is ControlKind =>
      (CONTROL_KINDS as string[]).includes(c),
    ),
    requiresConnection: row.requires_connection !== false,
    blurb: row.blurb ?? "",
    // Owner decision 2026-10-01: a mode whose firmware was never built must
    // not read as a working car. Default true (fail toward the honest
    // "not built yet" label) so a missing flag row can never understate the
    // gap; LOCAL_CAR_MODES supplies the real answer when flags are absent.
    isPlanned: PLANNED_MODE_IDS.includes(row.id as CarModeId),
  };
}

/** Merge `robo_car_modes_flags` (DB truth) over the catalogue defaults. */
function applyPlannedFlags(
  modes: CarMode[],
  flags: Map<string, { is_planned: boolean }>,
): CarMode[] {
  return modes.map((m) => {
    const f = flags.get(m.id);
    if (!f) return m;
    return { ...m, isPlanned: f.is_planned };
  });
}

/** Fetch the car-mode catalogue DB-first with the bundled list as fallback. */
export async function getCarModes(): Promise<CarMode[]> {
  if (!supabaseConfigured) return LOCAL_CAR_MODES;
  try {
    const { data, error } = await supabase
      .from("robo_car_modes")
      .select(
        "id,name,token,device_index,car,wheel,steering,sensors,transport,remote_with,controls,requires_connection,blurb",
      )
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return LOCAL_CAR_MODES;
    const modes = data
      .map((row) => mapRow(row as CarModeRow))
      .filter((m): m is CarMode => m !== null);
    if (modes.length === 0) return LOCAL_CAR_MODES;

    // Overlay the is_planned flags. Deliberately NOT fatal: if this second
    // read fails we keep the catalogue defaults, because a mode with no
    // firmware still has to be labelled "not built yet" from the bundled
    // PLANNED_MODE_IDS alone.
    let flagMap = new Map<string, { is_planned: boolean }>();
    try {
      const { data: flagRows } = await supabase
        .from("robo_car_modes_flags")
        .select("mode_id,is_planned");
      for (const f of (flagRows ?? []) as Record<string, unknown>[]) {
        if (typeof f.mode_id === "string")
          flagMap.set(f.mode_id, {
            is_planned: f.is_planned === true,
          });
      }
    } catch {
      // keep defaults
    }

    // Ensure the firmware-available modes are always present even if the DB
    // row has null id/name/token and was dropped. X-8: `4WD4M` is the
    // canonical token (legacy `BT` no longer a shipped mode); all 9 firmware
    // tokens are selectable in the controllers (owner decision 2026-09-15).
    const FIRMWARE_TOKENS = ["4WD4M", "AUTO", "2WD1M"] as const;
    for (const token of FIRMWARE_TOKENS) {
      const hasToken = modes.some((m) => m.token.toUpperCase() === token);
      if (!hasToken) {
        const fallback = LOCAL_CAR_MODES.find(
          (m) => m.token.toUpperCase() === token,
        );
        if (fallback) modes.push(fallback);
      }
    }

    return applyPlannedFlags(modes, flagMap);
  } catch {
    // Offline path still has to be honest about unbuilt modes, so it applies
    // the bundled PLANNED_MODE_IDS rather than returning the list untouched.
    return LOCAL_CAR_MODES.map((m) => ({
      ...m,
      isPlanned: PLANNED_MODE_IDS.includes(m.id),
    }));
  }
}
