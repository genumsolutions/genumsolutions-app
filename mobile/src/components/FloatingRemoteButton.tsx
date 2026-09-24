// =====================================================================
// FloatingRemoteButton (A-24) — a small draggable FAB shown app-wide
// while ANY car transport is linked (SPP / BLE / WiFi WS), so the user
// can jump straight back into the Remote window from anywhere.
//
// Behaviour:
//   - Shows ONLY while a link is live (spp | ble | wifi).
//   - Hidden while the RemoteControl screen itself is in front.
//   - Tap re-opens RemoteControl at the LAST USED category (persisted in
//     AsyncStorage; captured from the RemoteControl route params).
//   - Drag repositions the button; position persists via AsyncStorage.
//   - A drag is only treated as such past a movement threshold — a tap
//     that stays put navigates instead.
// =====================================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, PanResponder, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sppService } from "../services/sppService";
import { bleService } from "../services/bleService";
import { wifiService } from "../services/wifiService";
import { feedbackTap } from "../services/hapticsService";
import { navigationRef, navigate } from "../navigation/navigationRef";

const FAB_SIZE = 56;
const EDGE = 12;
/** Past this move distance a tap becomes a drag (reposition) instead. */
const DRAG_THRESHOLD = 12;

const SLOT_KEY = "genum.remote.fabSlot";
const CATEGORY_KEY = "genum.remote.lastCategory";

type Slot = { x: number; y: number };

function anyLinked(): boolean {
  return (
    sppService.isConnected || bleService.isConnected || wifiService.isConnected
  );
}

function isRemoteInFront(): boolean {
  return (
    navigationRef.isReady() &&
    navigationRef.getCurrentRoute()?.name === "RemoteControl"
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function defaultSlot(): Slot {
  const { width, height } = Dimensions.get("window");
  return { x: width - FAB_SIZE - EDGE, y: height - FAB_SIZE - EDGE };
}

async function loadSlot(): Promise<Slot> {
  try {
    const raw = await AsyncStorage.getItem(SLOT_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Slot;
      if (typeof s.x === "number" && typeof s.y === "number") return s;
    }
  } catch {
    /* fall through to default */
  }
  return defaultSlot();
}

async function persistSlot(slot: Slot): Promise<void> {
  try {
    await AsyncStorage.setItem(SLOT_KEY, JSON.stringify(slot));
  } catch {
    /* best effort */
  }
}

async function loadLastCategory(): Promise<string | undefined> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_KEY);
    return raw || undefined;
  } catch {
    return undefined;
  }
}

export function FloatingRemoteButton() {
  const [linked, setLinked] = useState(anyLinked);
  const [remoteInFront, setRemoteInFront] = useState(isRemoteInFront);
  const [slot, setSlot] = useState<Slot | null>(null);
  const slotRef = useRef<Slot | null>(null);
  const dragStart = useRef<Slot | null>(null);
  const movedRef = useRef(false);
  const lastCategoryRef = useRef<string | undefined>(undefined);

  // Link state: live refresh from every transport's status stream.
  useEffect(() => {
    const update = () => setLinked(anyLinked());
    const offSpp = sppService.onStatus(update);
    const offBle = bleService.onStatus(update);
    const offWifi = wifiService.onStatus(update);
    return () => {
      offSpp();
      offBle();
      offWifi();
    };
  }, []);

  // Persisted position + last category; and track navigation so we know when
  // the Remote window is in front (hide) or which category to reopen.
  //
  // A-45 (round-9) reliability: the navigation 'state' listener below used to
  // only attach when navigationRef was ALREADY ready at mount — but it rarely
  // is that early, so remoteInFront never updated and the FAB floated over the
  // Remote screen. Now we (a) retry attaching until the ref is ready, always
  // calling refresh() on attach, and (b) run a 1 s poll that re-checks
  // linked + remoteInFront as a safety net for any missed transport status
  // or navigation event.
  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    const attachIfReady = () => {
      if (!navigationRef.isReady() || unsub) return;
      unsub = navigationRef.addListener("state", refresh);
      refresh();
    };
    const refresh = () => {
      setRemoteInFront(isRemoteInFront());
      const route = navigationRef.getCurrentRoute();
      const cat = (route?.params as { category?: string } | undefined)
        ?.category;
      if (route?.name === "RemoteControl" && cat) {
        lastCategoryRef.current = cat;
        void AsyncStorage.setItem(CATEGORY_KEY, cat);
      }
    };
    void loadSlot().then((s) => {
      if (mounted) setSlot(s);
    });
    void loadLastCategory().then((c) => {
      if (mounted && c) lastCategoryRef.current = c;
    });
    attachIfReady();
    const poll = setInterval(() => {
      setLinked(anyLinked());
      if (!navigationRef.isReady()) attachIfReady();
      else refresh();
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(poll);
      unsub?.();
    };
  }, []);

  const openRemote = useCallback(() => {
    navigate("RemoteControl", { category: lastCategoryRef.current });
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = slotRef.current;
        movedRef.current = false;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (!dragStart.current) return;
        if (
          !movedRef.current &&
          (Math.abs(gesture.dx) >= DRAG_THRESHOLD ||
            Math.abs(gesture.dy) >= DRAG_THRESHOLD)
        ) {
          movedRef.current = true;
        }
        if (!movedRef.current) return;
        const { width, height } = Dimensions.get("window");
        setSlot({
          x: clamp(
            dragStart.current.x + gesture.dx,
            EDGE,
            width - FAB_SIZE - EDGE,
          ),
          y: clamp(
            dragStart.current.y + gesture.dy,
            EDGE,
            height - FAB_SIZE - EDGE,
          ),
        });
      },
      onPanResponderRelease: (_evt, gesture) => {
        const wasDrag = movedRef.current;
        dragStart.current = null;
        movedRef.current = false;
        if (wasDrag) {
          if (slotRef.current) void persistSlot(slotRef.current);
          return;
        }
        if (
          Math.abs(gesture.dx) < DRAG_THRESHOLD &&
          Math.abs(gesture.dy) < DRAG_THRESHOLD
        ) {
          feedbackTap();
          openRemote();
        }
      },
      onPanResponderTerminate: () => {
        dragStart.current = null;
        movedRef.current = false;
      },
    }),
  ).current;

  slotRef.current = slot;

  if (!linked || remoteInFront || !slot) return null;

  return (
    <View
      {...pan.panHandlers}
      style={[styles.fab, { left: slot.x, top: slot.y }]}
      accessibilityRole="button"
      accessibilityLabel="Open Remote window"
      testID="floating-remote-button"
    >
      <Feather name="target" size={24} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    zIndex: 999,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#1e3a8a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
});
