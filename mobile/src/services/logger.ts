// =====================================================================
// logger — the ONE shared logger of the app (FIN-15).
//
// Services + screens route diagnostics through here instead of calling
// console.error/warn directly, so log behaviour is controlled in one
// place:
//   • In development (__DEV__) everything prints to the console.
//   • In release builds only errors print (warnings become no-ops),
//     keeping the release console quiet without hiding real failures.
//
// The logger never throws and never awaits — safe from any call-site.
// `scope` is a short lowercase tag identifying the emitting module
// ('spp', 'wifi', 'push', 'admin', …) so log lines stay greppable.
// =====================================================================

type LogLevel = 'error' | 'warn'

const isDev = typeof __DEV__ !== 'undefined' && __DEV__

function log(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  if (level === 'warn' && !isDev) return
  const emit = level === 'error' ? console.error : console.warn
  if (detail === undefined) {
    emit(`[${scope}] ${message}`)
    return
  }
  emit(`[${scope}] ${message}`, detail)
}

export const logger = {
  /** Errors print in development AND release — real failures stay visible. */
  error(scope: string, message: string, detail?: unknown): void {
    log('error', scope, message, detail)
  },
  /** Warnings print in development only (silent in release builds). */
  warn(scope: string, message: string, detail?: unknown): void {
    log('warn', scope, message, detail)
  },
}
