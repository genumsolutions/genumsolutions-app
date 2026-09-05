// =====================================================================
// AutonomousControls — deck for the autonomous robot-car modes
// (Obstacle-US, Obstacle-IR, Path-Following) in the per-package Car
// Remote.
//
// Run/Stop follow the EXACT semantics of the token-capable modular car
// firmware (verified against UNO_Base_project_V2.0.1_MOD / the
// path-following V2_0_6_MOD command sheet):
//   - RUN  = send the mode token (`OBS_US` / `OBS_IR` / `PATH`). The car
//            switches mode, stops/resets its motors, and then runs the
//            sensor routine continuously from loop() — entering the mode
//            IS starting the routine; there is no separate start latch.
//   - STOP = send `BT`. The car switches back to Bluetooth/manual, which
//            halts motors and the routine. Movement letters (F/B/L/R/S)
//            only act in BT/manual mode, so they CANNOT stop a running
//            routine — the deck does not send them.
//   - SPEED = `SPD<110..250>` is accepted in every mode (saved to EEPROM
//            on the cars); the routines drive at that value, so it is the
//            one real tuning knob over BT. Sensor thresholds (DIST_NEAR
//            and friends) are firmware constants on current builds.
// =====================================================================
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Slider from '@react-native-community/slider'
import type { CarMode } from '../../config/roboCarCatalog'
import type { AutonomousControlsProps } from './types'

/** Mode-grounded tuning notes (values taken from the workspace firmware). */
function tuningNotes(mode: CarMode): { title: string; lines: string[] } {
  switch (mode.id) {
    case 'obstacle-us':
      return {
        title: 'Ultrasonic (HC-SR04)',
        lines: [
          'Detection distance ≈ DIST_NEAR (~20–23 cm, per build) — a firmware constant, not settable over BT.',
          'Run speed (SPD) sets motor pace and is saved on the car; SPD works in every mode.',
          'Token-capable builds only: builds that pick the mode with a hardware switch ignore BT mode tokens.',
        ],
      }
    case 'obstacle-ir':
      return {
        title: 'IR obstacle sensors',
        lines: [
          'The IR trigger distance is a firmware constant on this build.',
          'Run speed (SPD) scales how fast the car drives and turns between detections — keep it low indoors.',
          'Token-capable builds only: switch-wired IR builds need the physical mode switch set to the mode.',
        ],
      }
    case 'path-follow':
      return {
        title: 'Line / path sensors',
        lines: [
          'Modular path builds track at ≈ 80% of the run speed (SPD × 0.8).',
          'Line-sensor thresholds are firmware constants — tune speed on a steady, high-contrast line.',
          'Token-capable builds only: builds that pick the mode with a hardware switch ignore BT mode tokens.',
        ],
      }
    default:
      return {
        title: 'Sensor routine',
        lines: [
          'The car follows its sensor routine continuously once its mode is set.',
          'Run speed (SPD) tunes how fast it moves between detections.',
        ],
      }
  }
}

export function AutonomousControls({
  canControl, activeMode, speed, driveStatus,
  onSpeed, onRun, onStop,
}: AutonomousControlsProps) {
  const notes = tuningNotes(activeMode)
  const running = /run/i.test(driveStatus)

  return (
    <View className="mt-4 rounded-2xl border border-line bg-card p-5 shadow-card">
      {/* Header — no separate mode chip: on this firmware, entering the mode
          (Run) IS starting the routine, so a second token button would be a lie. */}
      <View className="flex-row items-center gap-2">
        <Feather name="cpu" size={14} color="#1e3a8a" />
        <Text className="text-xs font-black uppercase tracking-widest text-navy">
          Autonomous run
        </Text>
      </View>
      <Text className="mt-1 text-[11px] leading-4 text-muted">{notes.title}</Text>

      {/* Run / Stop — firmware-exact: token in, BT out. Letters (F/S) only
          move the car in BT/manual mode, so they cannot control a routine. */}
      <View className="mt-4 flex-row gap-3">
        <Pressable
          onPress={onRun}
          disabled={!canControl}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-navy px-6 py-3 disabled:opacity-60"
        >
          <Feather name="play" size={14} color="#fff" />
          <Text className="text-sm font-black text-white">Run</Text>
        </Pressable>
        <Pressable
          onPress={onStop}
          disabled={!canControl}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 py-3 disabled:opacity-60"
        >
          <Feather name="square" size={13} color="#1e3a8a" />
          <Text className="text-sm font-black text-ink">Stop</Text>
        </Pressable>
      </View>
      {canControl && (
        <>
          <Text className="mt-2 text-[11px] leading-4 text-muted">
            Run sends {activeMode.token} — the car switches mode and runs its routine until told
            otherwise. Stop sends BT, which halts the motors and returns to manual.
          </Text>
          <View className="mt-2 flex-row items-center gap-2">
            <View className={`h-2 w-2 rounded-full ${running ? 'bg-accent' : 'bg-border'}`} />
            <Text className="text-xs font-bold text-ink">{driveStatus || (running ? 'Running' : 'Stopped')}</Text>
          </View>
        </>
      )}

      {/* Tuning — run speed (the only value these cars tune over BT) */}
      <View className="mt-4 border-t border-line pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted">
            Run speed · tuning (SPD)
          </Text>
          <Text className="font-mono text-sm font-bold text-navy">{Math.round(speed)}</Text>
        </View>
        <Slider
          value={speed}
          minimumValue={110}
          maximumValue={250}
          step={5}
          onValueChange={onSpeed}
          disabled={!canControl}
          minimumTrackTintColor="#1e3a8a"
          maximumTrackTintColor="#cbd5e1"
          thumbTintColor="#1e3a8a"
        />
        <Text className="mt-1 text-[11px] leading-4 text-muted">
          110–250 in 5-unit steps — the modular builds' documented SPD range. It is accepted in
          every mode and saved on the car (the ESP remote's top-bar Speed for these modes).
        </Text>
      </View>

      {/* Thresholds — firmware-side on current builds */}
      <View className="mt-3 rounded-xl bg-sky px-4 py-3">
        <Text className="text-xs font-bold text-navy">Thresholds on this car</Text>
        {notes.lines.map((line) => (
          <View key={line} className="mt-1 flex-row items-start gap-2">
            <Text className="mt-0.5 text-[10px] text-navy">•</Text>
            <Text className="flex-1 text-[11px] leading-4 text-muted">{line}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
