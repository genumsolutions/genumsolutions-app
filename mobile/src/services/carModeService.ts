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
import { supabase, supabaseConfigured } from '../config/supabase';
import {
  LOCAL_CAR_MODES,
  type CarMode,
  type CarModeId,
  type ControlKind,
} from '../config/roboCarCatalog';

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

const TRANSPORTS = ['ble', 'wifi', 'classic-bt', 'rf'] as const;
const CONTROL_KINDS: ControlKind[] = [
  'drive-tank',
  'drive-2wd1m',
  'pid-auto',
  'start-stop',
  'tuning',
  'weblink',
];

/** sensors/transport/controls are TEXT columns holding JSON arrays. */
function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string' && value.trim()) {
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
    car: row.car ?? '',
    wheel: row.wheel ?? '',
    steering: row.steering ?? '',
    sensors: parseList(row.sensors),
    transport: parseList(row.transport).filter(
      (t): t is (typeof TRANSPORTS)[number] => (TRANSPORTS as readonly string[]).includes(t)
    ),
    remoteWith: row.remote_with ?? '',
    controls: parseList(row.controls).filter(
      (c): c is ControlKind => (CONTROL_KINDS as string[]).includes(c)
    ),
    requiresConnection: row.requires_connection !== false,
    blurb: row.blurb ?? '',
  };
}

/** Fetch the car-mode catalogue DB-first with the bundled list as fallback. */
export async function getCarModes(): Promise<CarMode[]> {
  if (!supabaseConfigured) return LOCAL_CAR_MODES;
  try {
    const { data, error } = await supabase
      .from('robo_car_modes')
      .select(
        'id,name,token,device_index,car,wheel,steering,sensors,transport,remote_with,controls,requires_connection,blurb'
      )
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return LOCAL_CAR_MODES;
    const modes = data
      .map((row) => mapRow(row as CarModeRow))
      .filter((m): m is CarMode => m !== null);
    return modes.length > 0 ? modes : LOCAL_CAR_MODES;
  } catch {
    return LOCAL_CAR_MODES;
  }
}
