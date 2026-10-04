// =====================================================================
// U-89: WHICH CONNECTION METHOD THE PAGE SHOULD SHOW.
//
// The defect this exists to prevent (owner: *"the wifi method is not built well
// and complete, not everything works"*):
//
//   The Wi-Fi controls — every saved router, the switch, the search, the add
//   form — render only when the selected method is "wifi". The selected method
//   was set only by tapping a dropdown. So a user who connected by any other
//   route (automatic discovery, the Connect button, a link that was already
//   live) got a WORKING connection and no Wi-Fi controls at all.
//
//   Connecting worked. Configuring the car did not exist on the screen.
//
// So the method shown is the one the user chose, and otherwise the link that is
// actually in use. It never overrides a deliberate choice.
//
// Pure, so it can be pinned without rendering anything.
// =====================================================================

export type ConnectionMethodId = "bluetooth" | "wifi" | "internet";

export function effectiveMethod(input: {
  /** What the user explicitly picked, if anything. Always wins. */
  chosen: ConnectionMethodId | null;
  wifiConnected: boolean;
  bluetoothConnected: boolean;
}): ConnectionMethodId | null {
  if (input.chosen) return input.chosen;
  if (input.wifiConnected) return "wifi";
  if (input.bluetoothConnected) return "bluetooth";
  return null;
}
