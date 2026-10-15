# tools/

Shared utilities for the Genum app + the car firmware.

## Build / compile checklist

See [`build_notes.md`](build_notes.md). It records:

- the ESP32 toolchain install layout (`Arduino15` under `C:\Users\caSPe\AppData\Local\Arduino15\\`),
- the car sketch entry (`Genum_4WD4M_CAR.ino`) and its `BoardType: ESP32`,
- which files were edited this session and why,
- how to verify the in-IDE compile.

## What this directory contains

| File                                                      | Purpose                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PidInputModal.tsx`                                       | Direct PID numeric entry overlay (R-15: sits in upper third, `KeyboardAvoidingView` so a tall keyboard never covers the input). |
| `ModeChooser.tsx`                                         | Mode picker row that reflects `GROUP` capability.                                                                               |
| `DriveTelemetry.tsx`                                      | Telemetry display.                                                                                                              |
| `oneActiveLink.test.ts`                                   | Unit tests for `oneActiveLink` (each link may be active, carrier state immutable).                                              |
| `useControlHub.ts`                                        | Link state/command hook (imports types from `../transports/types`).                                                             |
| `PidInputModal.tsx.less` / `build_notes.md` / `README.md` | build/readme extras.                                                                                                            |
