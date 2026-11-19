import { describe, expect, it } from "vitest";
import {
  addProjectMaterial,
  mergeProjectMaterials,
  toggleProjectMaterial,
  type ProjectMaterial,
} from "./projectMaterialsService";

describe("projectMaterialsService — the per-project parts checklist", () => {
  it("seeds the catalog's required parts unticked", () => {
    const items = mergeProjectMaterials(["ESP32 Dev Module", "L298N"], []);
    expect(items).toEqual([
      { label: "ESP32 Dev Module", done: false },
      { label: "L298N", done: false },
    ]);
  });

  it("keeps the user's tick state across catalog reads (case-insensitive)", () => {
    const saved: ProjectMaterial[] = [
      { label: "esp32 dev module", done: true },
    ];
    const items = mergeProjectMaterials(["ESP32 Dev Module"], saved);
    expect(items).toEqual([{ label: "ESP32 Dev Module", done: true }]);
  });

  it("adds newly required parts and drops catalog parts that vanished", () => {
    const saved: ProjectMaterial[] = [
      { label: "Old servo", done: true },
      { label: "L298N", done: true },
    ];
    const items = mergeProjectMaterials(["ESP32 Dev Module", "L298N"], saved);
    expect(items.map((i) => i.label)).toEqual([
      "ESP32 Dev Module",
      "L298N",
      "Old servo",
    ]);
    expect(items[2]).toMatchObject({ done: true, custom: true });
  });

  it("does not duplicate repeated catalog entries", () => {
    const items = mergeProjectMaterials(["OLED", "OLED"], []);
    expect(items).toHaveLength(1);
  });

  it("toggles one part without touching the others", () => {
    const items: ProjectMaterial[] = [
      { label: "Battery", done: false },
      { label: "OLED", done: false },
    ];
    expect(toggleProjectMaterial(items, "oled")).toEqual([
      { label: "Battery", done: false },
      { label: "OLED", done: true },
    ]);
  });

  it("appends user parts, ignoring blanks and duplicates", () => {
    const items: ProjectMaterial[] = [{ label: "Battery", done: false }];
    expect(addProjectMaterial(items, "   ")).toBe(items);
    expect(addProjectMaterial(items, "battery")).toBe(items);
    expect(addProjectMaterial(items, " Jumper wires ")).toEqual([
      { label: "Battery", done: false },
      { label: "Jumper wires", done: false, custom: true },
    ]);
  });
});
