// =====================================================================
// logger — the ONE shared logger of the app (FIN-15).
//
// Services + screens route diagnostics through here instead of calling
// console.error/warn directly, so log behaviour is controlled in one
// place:
//   • In development (__DEV__) everything prints to the console.
//   • In release builds only errors print (warnings become no-ops),
//     keeping the release console quiet without hiding real failures.
//   • U-R3 (2026-10-12): every printed line is ALSO appended to the
//     persisted ring + upload queue (appLogService) so staff/admin can read
//     real device errors from the Admin "System Logs" tab instead of a
//     console nobody is watching. Fire-and-forget — the logger never awaits.
//
// The logger never throws and never awaits — safe from any call-site.
// `scope` is a short lowercase tag identifying the emitting module
// ('spp', 'wifi', 'push', 'admin', …) so log lines stay greppable.
// =====================================================================

type LogLevel = "error" | "warn";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

function log(
  level: LogLevel,
  scope: string,
  message: string,
  detail?: unknown,
): void {
  if (level === "warn" && !isDev) return;
  const emit = level === "error" ? console.error : console.warn;
  if (detail === undefined) {
    emit(`[${scope}] ${message}`);
  } else {
    emit(`[${scope}] ${message}`, detail);
  }
  // Persist the line for the fleet log medium. Errors persist in both dev and
  // release; warns persist in dev only (mirroring the console rule above — a
  // warn that stays invisible in a release build is not worth a cloud row).
  //
  // Lazy import: appLogService pulls in react-native (Platform) and
  // AsyncStorage, and this logger is imported by pure modules that unit tests
  // load in a plain node environment — a static import would drag the RN module
  // graph into every such suite. Loading it only when a line is actually
  // persisted keeps the static graph node-safe, and the dynamic import is
  // supported by Metro (Expo SDK 54). Best-effort and not awaited.
  if (level === "error" || isDev) {
    void import("./appLogService")
      .then((m) => m.appendLog({ scope, level, message, detail }))
      .catch(() => {});
  }
}

export const logger = {
  /** Errors print in development AND release — real failures stay visible. */
  error(scope: string, message: string, detail?: unknown): void {
    log("error", scope, message, detail);
  },
  /** Warnings print in development only (silent in release builds). */
  warn(scope: string, message: string, detail?: unknown): void {
    log("warn", scope, message, detail);
  },
};
