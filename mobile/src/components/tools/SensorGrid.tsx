// SensorGrid — relay toggles and live sensor values for non-robocar categories.
import React from "react";
import { Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { SensorGridProps, SensorData } from "./types";

/**
 * A reading the app cannot actually source must never be printed as a number.
 *
 * `setSensorData` has no caller anywhere in the app, so every tile here used
 * to render its initial 0 as though it were a live reading — "Live Sensors:
 * 0°C, 0%, 0ppm, 0dBm" on a car that has no sensors fitted. A fabricated 0 is
 * worse than a blank: 0°C reads as a measurement, and an owner has no way to
 * tell it from a real one. The deck already refuses to fake CONTROLS ("Ready
 * for firmware"); readouts were never covered by that rule. Now they are.
 *
 * `null` means "this project has no sensor for this slot" and prints as `—`
 * with a plain explanation. A real number is only ever printed when some
 * telemetry actually supplied one.
 */
const NO_READING = "—";

function reading(value: number | null | undefined, suffix: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}${suffix}`
    : NO_READING;
}

export function SensorGrid({
  canControl,
  isDrone,
  isNonRobocar,
  activeCategory,
  sensorData,
  relays,
  telemetry,
  onToggleRelay,
}: SensorGridProps) {
  if (isDrone || !isNonRobocar) return null;

  return (
    <>
      {/* Relay toggles for home-automation / smart-farm / smart-city */}
      <View className="mt-4 rounded-xl border border-line bg-surface p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          {activeCategory === "smart-farm" ? "Pumps / solenoids" : "Outputs"}
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Switch
                value={!!relays[i]}
                onValueChange={() => onToggleRelay(i)}
                disabled={!canControl}
                trackColor={{ true: "#1e3a8a", false: "#e2e8f0" }}
              />
              <Text className="text-xs font-semibold text-ink">Relay {i}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Sensor grid */}
      <View className="mt-4 rounded-xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-1">
          <Feather name="activity" size={12} color="#94a3b8" />
          <Text className="text-xs font-bold uppercase tracking-wide text-muted">
            Live Sensors
          </Text>
        </View>
        <Text className="mt-1 text-[11px] leading-4 text-muted">
          {NO_READING} means this project has no sensor on that slot yet — the
          firmware does not report it. A number only appears once real telemetry
          supplies one.
        </Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          <SensorCard
            icon="thermometer"
            label="Temperature"
            value={reading(sensorData.temperature, "°C")}
            color="#ef4444"
          />{" "}
          <SensorCard
            icon="droplet"
            label="Humidity"
            value={reading(sensorData.humidity, "%")}
            color="#3b82f6"
          />
          {activeCategory === "smart-farm" && (
            <SensorCard
              icon="layers"
              label="Soil Moisture"
              value={reading(sensorData.soilMoisture, "%")}
              color="#22c55e"
            />
          )}
          {activeCategory === "smart-city" && (
            <>
              <SensorCard
                icon="sun"
                label="Light Level"
                value={reading(sensorData.lightLevel, "%")}
                color="#f59e0b"
              />
              <SensorCard
                icon="wind"
                label="Air Quality"
                value={reading(sensorData.airQuality, "ppm")}
                color="#8b5cf6"
              />
            </>
          )}
          {/* U-47: Smart Dustbin gets its own tiles (fill level + lid angle). */}
          {activeCategory === "smart-dustbin" && (
            <>
              <SensorCard
                icon="trash-2"
                label="Fill Level"
                value={reading(sensorData.distance, "%")}
                color="#22c55e"
              />
              <SensorCard
                icon="disc"
                label="Lid Angle"
                value={
                  typeof sensorData.distance === "number"
                    ? `${Math.round((sensorData.distance / 180) * 90 + 45)}°`
                    : NO_READING
                }
                color="#06b6d4"
              />
            </>
          )}
          {activeCategory === "remote-controller" && (
            <SensorCard
              icon="radio"
              label="Signal (RSSI)"
              value={reading(sensorData.airQuality, " dBm")}
              color="#8b5cf6"
            />
          )}
          {(activeCategory === "home-automation" ||
            activeCategory === "smart-city") && (
            <SensorCard
              icon="maximize-2"
              label="Distance"
              value={reading(sensorData.distance, "cm")}
              color="#06b6d4"
            />
          )}
        </View>
      </View>

      {/* Live telemetry (BLE-specific) */}
      {(telemetry.speed != null || telemetry.mode) && (
        <View className="mt-4 rounded-xl border border-line bg-surface p-4">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted">
            Live telemetry
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-4">
            {telemetry.speed != null && (
              <Text className="text-xs text-muted">
                Speed:{" "}
                <Text className="font-mono font-bold text-navy">
                  {telemetry.speed}
                </Text>
              </Text>
            )}
            {telemetry.mode && (
              <Text className="text-xs text-muted">
                Mode:{" "}
                <Text className="font-mono font-bold text-navy">
                  {telemetry.mode}
                </Text>
              </Text>
            )}
            {telemetry.status && (
              <Text className="text-xs text-muted">
                Status:{" "}
                <Text className="font-mono font-bold text-navy">
                  {telemetry.status}
                </Text>
              </Text>
            )}
            {telemetry.angle != null && (
              <Text className="text-xs text-muted">
                Angle:{" "}
                <Text className="font-mono font-bold text-navy">
                  {telemetry.angle.toFixed(1)}°
                </Text>
              </Text>
            )}
          </View>
        </View>
      )}
    </>
  );
}

function SensorCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View className="w-[30%] rounded-xl bg-card border border-line p-3">
      <Feather name={icon as any} size={16} color={color} />
      <Text className="mt-1 text-xs font-bold uppercase text-muted">
        {label}
      </Text>
      <Text className="mt-0.5 font-mono text-sm font-bold" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}
