// =====================================================================
// wifiDiagnostics — WHY is the WiFi link not working?
//
// The owner's 2026-09-28 report: "the car is working perfect on bluetooth
// but the app and car don't connect at all in the wifi connection. I don't
// know what going on." The old code answered that with a single boolean
// ("not connected"), which cannot distinguish these very different faults:
//
//   A. the phone never joined the car's access point      (user error)
//   B. the phone joined it but Android flipped back to
//      cellular before the socket opened                    (OS)
//   C. the car is unreachable at the IP                     (firmware/AP)
//   D. the car IS reachable but the app's own manifest
//      blocks the cleartext ws:// / http:// traffic        (APP BUG)
//   E. the socket opened but the car never answers          (firmware)
//
// A–C and E are all reported to the user as the same "WiFi failed", so
// every round of testing guessed. This module turns that into a verdict
// list with an actionable fix per fault, and a HTTP probe that isolates
// firmware problems (C) from app-config problems (D).
//
// The probe is deliberately HTTP, not WebSocket: the car serves its page
// on :80 and the socket on :81. Probing :80 answers the one question we
// actually need — "does the phone's network stack reach the car at all?"
// If :80 answers but the WS link still fails, the fault is in our own
// layer (D/E), not in the radio or the firmware's network setup.
//
// NOTE on `isInternetReachable`: the car's softAP has NO upstream
// internet, so a false there is CORRECT and must never be reported as a
// fault (that would send the owner hunting a problem they don't have).
// =====================================================================
import { DEFAULT_AP_IP, isOwnApName } from "./carProtocol";

/* eslint-disable @typescript-eslint/no-require-imports */

// NetInfo is loaded LAZILY for the same reason safeNative exists: a static
// import of a native module can throw while the bundle evaluates, and the
// node-side vitest run (environment: "node") cannot resolve it at all. The
// pure `diagnose` logic below must stay importable without a radio.
type NetInfoLike = {
  fetch: () => Promise<unknown>;
};
let netInfoModule: NetInfoLike | null | undefined;

function getNetInfo(): NetInfoLike | null {
  if (netInfoModule === undefined) {
    try {
      netInfoModule = require("@react-native-community/netinfo")
        .default as NetInfoLike;
    } catch {
      netInfoModule = null;
    }
  }
  return netInfoModule;
}

/** @internal test-only injection (node vitest cannot require the native pkg). */
export function __setNetInfoForTests(mod: NetInfoLike | null): void {
  netInfoModule = mod;
}

/** What NetInfo can tell us about the phone's current network. */
export type NetworkSnapshot = {
  /** "wifi" | "cellular" | "none" | null when NetInfo has no answer yet. */
  type: string | null;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  /** The phone's own address on the current network. */
  ip: string | null;
  /** The joined network name — needs a location permission on Android. */
  ssid: string | null;
  /** True when the phone looks like it is on a car-owned access point. */
  onCarAp: boolean;
  /** True when the phone's IP sits in the car's AP subnet. */
  onCarSubnet: boolean;
};

/** Result of the raw HTTP round-trip to the car's web server. */
export type HttpProbeResult = {
  url: string;
  ok: boolean;
  status: number | null;
  /** Milliseconds the round-trip took, or null when it never landed. */
  ms: number | null;
  error: string | null;
  /** First slice of the response body — proves it really is the car. */
  bodyHead: string | null;
};

export type VerdictSeverity = "pass" | "warn" | "fail";

/** One finding, with the concrete action that resolves it. */
export type DiagnosticVerdict = {
  id: string;
  severity: VerdictSeverity;
  title: string;
  detail: string;
  /** Owner-facing remedy. null when the finding is informational. */
  fix: string | null;
};

export type WifiDiagnosis = {
  network: NetworkSnapshot;
  probe: HttpProbeResult | null;
  verdicts: DiagnosticVerdict[];
  /** One line naming the most likely single cause. */
  summary: string;
  /** True when nothing in this report blocks driving. */
  healthy: boolean;
};

const CAR_AP_SUBNET = "192.168.245.";
const PROBE_TIMEOUT_MS = 4000;

// --- network snapshot ------------------------------------------------

type LooseDetails = {
  ipAddress?: string | null;
  ssid?: string | null;
  [k: string]: unknown;
};

/**
 * Read the phone's current network. Never throws: a NetInfo failure
 * degrades to an empty snapshot so the panel can still report the probe.
 */
export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const empty: NetworkSnapshot = {
    type: null,
    isConnected: null,
    isInternetReachable: null,
    ip: null,
    ssid: null,
    onCarAp: false,
    onCarSubnet: false,
  };
  let state: {
    type?: string | null;
    isConnected?: boolean | null;
    isInternetReachable?: boolean | null;
    details?: LooseDetails | null;
  };
  const netInfo = getNetInfo();
  if (!netInfo) return empty;
  try {
    state = (await netInfo.fetch()) as unknown as typeof state;
  } catch {
    return empty;
  }

  const details = state.details ?? {};
  // SSID is "<unknown ssid>" when the OS withholds it (no location
  // permission yet). Treat that placeholder as "not known", never as a
  // real network name to compare against.
  const rawSsid =
    typeof details.ssid === "string" && details.ssid !== "<unknown ssid>"
      ? details.ssid
      : null;
  const ip =
    typeof details.ipAddress === "string" && details.ipAddress.length > 0
      ? details.ipAddress
      : null;

  return {
    type: state.type ?? null,
    isConnected: state.isConnected ?? null,
    isInternetReachable: state.isInternetReachable ?? null,
    ip,
    ssid: rawSsid,
    onCarAp: rawSsid !== null && isOwnApName(rawSsid),
    onCarSubnet: ip !== null && ip.startsWith(CAR_AP_SUBNET),
  };
}

// --- http probe ------------------------------------------------------

/**
 * Plain HTTP round-trip to the car. Any response at all (even 404) proves
 * the phone's stack reaches the car — that is the whole point.
 */
export async function probeCarHttp(
  ip: string = DEFAULT_AP_IP,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<HttpProbeResult> {
  const url = `http://${ip}/`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    let bodyHead: string | null = null;
    try {
      bodyHead = (await res.text()).slice(0, 400);
    } catch {
      bodyHead = null;
    }
    return {
      url,
      // The car has no auth and answers 200, but ANY status means "alive".
      ok: res.status > 0,
      status: res.status,
      ms,
      error: null,
      bodyHead,
    };
  } catch (e) {
    return {
      url,
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      bodyHead: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- diagnosis -------------------------------------------------------

export type WifiDiagnosisInput = {
  network: NetworkSnapshot;
  probe: HttpProbeResult | null;
  /** Transport state from the active WiFi link, when one was attempted. */
  link?: {
    url: string | null;
    isConnected: boolean;
    linkVerified: boolean;
    lastError: string | null;
  } | null;
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the probe body looks like the car's own page. */
function looksLikeCar(bodyHead: string | null): boolean {
  if (!bodyHead) return false;
  const text = stripTags(bodyHead).toLowerCase();
  return (
    text.includes("genum") ||
    text.includes("4wd") ||
    text.includes("car") ||
    text.includes("mode")
  );
}

/**
 * Build the verdict list. Pure function of its input so it is unit
 * testable without NetInfo, a radio, or a real car.
 */
export function diagnose(input: WifiDiagnosisInput): WifiDiagnosis {
  const { network, probe, link = null } = input;
  const verdicts: DiagnosticVerdict[] = [];

  // --- 1. is the phone on WiFi at all? ---
  if (network.type === "wifi") {
    verdicts.push({
      id: "on-wifi",
      severity: "pass",
      title: "Phone is on WiFi",
      detail: `Connected to ${network.ssid ?? "a network whose name Android withheld"}.`,
      fix: null,
    });
  } else if (network.type === "cellular") {
    verdicts.push({
      id: "on-cellular",
      severity: "fail",
      title: "Phone is on mobile data, not WiFi",
      detail:
        "The car is a WiFi access point, so it can only be reached while the phone is joined to it.",
      fix: "Turn off mobile data, then join the car's WiFi network.",
    });
  } else {
    verdicts.push({
      id: "no-network",
      severity: "fail",
      title: "Phone has no usable network",
      detail: `Android reports the connection type as "${network.type ?? "unknown"}".`,
      fix: "Enable WiFi and join the car's network.",
    });
  }

  // --- 2. joined the car's own AP? ---
  if (network.onCarAp) {
    verdicts.push({
      id: "on-car-ap",
      severity: "pass",
      title: "Joined the car's access point",
      detail: `The phone is on ${network.ssid}.`,
      fix: null,
    });
  } else if (network.onCarSubnet) {
    // Same subnet but a different name — almost always the car joined a
    // home router instead of running its own AP.
    verdicts.push({
      id: "car-subnet",
      severity: "warn",
      title: "On the car's subnet, but not its access point",
      detail: `The phone is on ${network.ssid ?? "another network"} at ${network.ip}, inside 192.168.245.x.`,
      fix: "Join the car's own access point to test it directly, or use the router address in the WiFi URL box.",
    });
  } else {
    verdicts.push({
      id: "not-car-ap",
      severity: "fail",
      title: "Not connected to the car's WiFi",
      detail: network.ssid
        ? `The phone is on "${network.ssid}" (${network.ip ?? "no local IP"}), which is not the car's network.`
        : "The phone is on a different network, so it cannot reach the car at all.",
      fix: "Open Android Settings → WiFi and join the car's network, then return to the app.",
    });
  }

  // --- 3. can the phone's network stack reach the car? ---
  if (!probe) {
    verdicts.push({
      id: "probe-missing",
      severity: "warn",
      title: "Car reachability not tested",
      detail: "No network probe was run.",
      fix: "Run the WiFi test to probe the car.",
    });
  } else if (probe.ok) {
    verdicts.push({
      id: "probe-ok",
      severity: "pass",
      title: "Car answered over HTTP",
      detail: looksLikeCar(probe.bodyHead)
        ? `The car replied in ${probe.ms} ms and the page is the car's own. The car's WiFi and web server are healthy.`
        : `The car replied in ${probe.ms} ms. The network path to the car works.`,
      fix: null,
    });
  } else if (!network.onCarAp && !network.onCarSubnet) {
    verdicts.push({
      id: "probe-wrong-network",
      severity: "fail",
      title: "Car unreachable from this network",
      detail: `Nothing answered at ${probe.url} (${probe.error ?? "no reply"}). This is expected while the phone is on a different network.`,
      fix: "Join the car's WiFi network, then run the test again.",
    });
  } else {
    // On the right network yet no answer — the two real causes are our own
    // cleartext block and a dead car radio. Name both honestly; a JS-level
    // fetch rejection cannot tell them apart.
    verdicts.push({
      id: "probe-blocked",
      severity: "fail",
      title: "Car silent on the right network",
      detail: `The phone is on the car's network, but nothing answered at ${probe.url} (${probe.error ?? "no reply"}). Either the app's manifest is blocking cleartext HTTP, or the car's access point is not running.`,
      fix: "Open the car's address in the phone's browser. If the car page loads, the app is the problem and needs the new build; if it fails, the car's access point is the problem.",
    });
  }

  // --- 4. the app's own link layer ---
  if (link) {
    if (link.linkVerified) {
      verdicts.push({
        id: "link-verified",
        severity: "pass",
        title: "App link verified",
        detail: `The car answered the app on ${link.url}. The app can drive it.`,
        fix: null,
      });
    } else if (link.isConnected) {
      verdicts.push({
        id: "link-open-silent",
        severity: "fail",
        title: "Socket open but the car never answered",
        detail: `The WebSocket to ${link.url} opened, yet no telemetry arrived. The car's web server is accepting connections but not replying.`,
        fix: "Power-cycle the car and reconnect. If it repeats, the car's web layer is at fault.",
      });
    } else if (link.lastError) {
      verdicts.push({
        id: "link-error",
        severity: "fail",
        title: "App could not open the link",
        detail: link.lastError,
        fix: "Run the network test above to see which layer is failing.",
      });
    }
  }

  const failures = verdicts.filter((v) => v.severity === "fail");
  const firstFailure = failures[0] ?? null;

  // Prefer the most specific cause available: a dead link beats a generic
  // network complaint, and a reachable car beats both.
  const summary = link?.linkVerified
    ? "The app is connected to the car and receiving telemetry."
    : probe?.ok
      ? "The car is reachable over the network, but the app link is not up."
      : (firstFailure?.title ?? "WiFi is healthy.");

  return {
    network,
    probe,
    verdicts,
    summary,
    healthy: failures.length === 0,
  };
}

/** Snapshot + probe + verdict list in one call, for the panel's Run button. */
export async function runWifiDiagnosis(
  link: WifiDiagnosisInput["link"] = null,
  ip: string = DEFAULT_AP_IP,
): Promise<WifiDiagnosis> {
  const network = await getNetworkSnapshot();
  const probe = await probeCarHttp(ip);
  return diagnose({ network, probe, link });
}
