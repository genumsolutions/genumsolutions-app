// =====================================================================
// WifiDiagnosticsPanel — the "why is WiFi not working" panel.
//
// Companion to wifiDiagnostics. The owner hit a link that simply refused
// to come up with no way to tell firmware trouble from app trouble, which
// turned every attempt into a guess. This panel runs the network snapshot
// + HTTP probe and states, in plain language, which layer is at fault and
// what to do about it — so a failed test is actionable instead of opaque.
//
// Pure display + a Run button: it never mutates connection state, so it is
// safe to leave on the Control Panel while links come and go.
// =====================================================================
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  runWifiDiagnosis,
  type DiagnosticVerdict,
  type VerdictSeverity,
  type WifiDiagnosis,
} from "../../services/wifiDiagnostics";
import { DEFAULT_AP_IP } from "../../services/carProtocol";

export type WifiDiagnosticsPanelProps = {
  /** Live state of the app's WiFi link, so the report covers both layers. */
  link: {
    url: string | null;
    isConnected: boolean;
    linkVerified: boolean;
    lastError: string | null;
  } | null;
  /** The address being tested. Defaults to the car's access-point IP. */
  targetIp?: string;
};

const SEVERITY_STYLE: Record<
  VerdictSeverity,
  { icon: keyof typeof Feather.glyphMap; tint: string; ring: string }
> = {
  pass: {
    icon: "check-circle",
    tint: "#059669",
    ring: "border-emerald-500/40",
  },
  warn: {
    icon: "alert-triangle",
    tint: "#d97706",
    ring: "border-amber-500/40",
  },
  fail: { icon: "x-circle", tint: "#dc2626", ring: "border-red-500/40" },
};

function VerdictRow({ v }: { v: DiagnosticVerdict }) {
  const s = SEVERITY_STYLE[v.severity];
  return (
    <View className={`mt-2 rounded-lg border bg-card p-2.5 ${s.ring}`}>
      <View className="flex-row items-center gap-2">
        <Feather name={s.icon} size={14} color={s.tint} />
        <Text className="flex-1 text-[13px] font-black text-ink dark:text-white">
          {v.title}
        </Text>
      </View>
      <Text className="mt-1 text-[12px] leading-4 text-muted">{v.detail}</Text>
      {v.fix ? (
        <View className="mt-1.5 flex-row gap-1.5">
          <Feather name="corner-down-right" size={11} color="#64748b" />
          <Text className="flex-1 text-[12px] font-bold leading-4 text-sky-700 dark:text-sky-300">
            {v.fix}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function WifiDiagnosticsPanel({
  link,
  targetIp = DEFAULT_AP_IP,
}: WifiDiagnosticsPanelProps) {
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<WifiDiagnosis | null>(null);

  const run = React.useCallback(async () => {
    setBusy(true);
    try {
      setReport(await runWifiDiagnosis(link, targetIp));
    } finally {
      setBusy(false);
    }
  }, [link, targetIp]);

  return (
    <View className="rounded-xl border border-line bg-mist p-3 dark:bg-mist">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className="text-[11px] font-black uppercase tracking-wide text-muted">
            WiFi test
          </Text>
          <Text className="mt-0.5 text-[12px] leading-4 text-muted">
            Finds out whether the phone, the network, or the app is at fault.
          </Text>
        </View>
        <Pressable
          onPress={run}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Run the WiFi connection test"
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-sky-700 px-4 disabled:opacity-50"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="zap" size={13} color="#fff" />
          )}
          <Text className="text-[12px] font-black text-white">
            {busy ? "Testing…" : "Run test"}
          </Text>
        </Pressable>
      </View>

      {report ? (
        <ScrollView
          className="mt-1"
          style={{ maxHeight: 320 }}
          nestedScrollEnabled
        >
          <View
            className={`mt-2 flex-row items-center gap-2 rounded-lg border p-2.5 ${
              report.healthy
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/40 bg-amber-500/10"
            }`}
          >
            <Feather
              name={report.healthy ? "check-circle" : "alert-triangle"}
              size={15}
              color={report.healthy ? "#059669" : "#d97706"}
            />
            <Text className="flex-1 text-[12px] font-black leading-4 text-ink dark:text-white">
              {report.summary}
            </Text>
          </View>

          {report.verdicts.map((v) => (
            <VerdictRow key={v.id} v={v} />
          ))}

          {report.probe ? (
            <Text className="mt-2 text-[11px] leading-4 text-muted">
              Probe: {report.probe.url} —{" "}
              {report.probe.ok
                ? `HTTP ${report.probe.status} in ${report.probe.ms} ms`
                : `no reply (${report.probe.error ?? "timeout"})`}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <Text className="mt-1.5 text-[12px] leading-4 text-muted">
          Run the test before driving over WiFi — it names the exact layer that
          is failing.
        </Text>
      )}
    </View>
  );
}
