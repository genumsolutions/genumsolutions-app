# Genum_4WD4M_CAR — compile/build checklist

## What this is

ESP32 + L298N 4WD4M car firmware. Singleboard entry point:

```
E:\GENUM SOLUTIONS PVT LTD\Project\Genum_4WD4M_CAR\Genum_4WD4M_CAR.ino
```

Board type is `enum class BoardType : uint8_t { ESP32 }` in `Config.h`.

## Required toolchain (already installed in this env)

The environment uses the Arduino 1.5-style install under:

```
C:\Users\caSPe\AppData\Local\Arduino15\
```

- ESP32 core: `packages\esp32\hardware\esp32\3.3.12`
  - board definitions: `boards.txt`
  - tools: `tools\esptool`, `tools\openocd`, `tools\xtensa-esp-elf\bin`,
    `tools\xtensa-esp-elf-gdb`, `tools\riscv32-esp-elf-gdb`,
    `tools\mklittlefs`, `tools\mkspiffs`
- Arduino core: `packages\arduino\hardware\avr\1.8.8`
- NOTE: there is **no** `arduino-cli` and **no** desktop `arduino` binary on PATH in
  this environment. The desktop IDE was not installed here.

## Compile approach (ESP32 — no USB needed for Verify)

1. `File -> Open` in the Arduino IDE → open `Genum_4WD4M_CAR.ino`.
2. `Sketch -> Verify/Compile` (ESP32 does not require an uploader to verify).
3. Board: select an ESP32 board that matches the sketch's `CommType` (BLUETOOTH /
   WIFI / WEBSERVER / WEBCLIENT).

## Files changed this session

- `Config.h`
  - added the single-source config surface `CONFIG_TELEMETRY_PARAMETERS`
    (`tele.parameters,frequency,1600,vysexcvr,0`). This is the only place `frequency`
    and `vysexcvr` are defined/wired.
- `WebServerComm.cpp`
  - `buildStatusJson` now emits `"tele_params":"freq=%s, vyse=%s"` using the surface's
    values (`freqBuf`, `vyseBuf`).
- `TSH/test_suites/test_config_integrity.py`
  - fixed the test's `ROOT` computation (it walks up from the test file to
    `Genum_4WD4M_CAR` instead of stopping one level too early at `TSH`).

## Validation

- `TSH` gate: `python3 TSH/test_suites/test_config_integrity.py` → `PASS`, exit 0.
- In-IDE: verify/compile the sketch. Any errors in the toolchain/cores must be
  fixed at the source (toolchain bug), not by disabling warnings.
  EOF
  cat "genumsolutions-app/mobile/src/components/tools/build_notes.md"
