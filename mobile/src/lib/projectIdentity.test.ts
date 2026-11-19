import { describe, expect, it } from "vitest";
import {
  projectMatchesProduct,
  projectToken,
  resolveProject,
} from "./projectIdentity";

describe("projectIdentity — firmware project id → project card", () => {
  it("strips the firmware's trailing 'car' to compare projects", () => {
    expect(projectToken("4wd4mcar")).toBe("4wd4m");
    expect(projectToken("2WD1M-CAR")).toBe("2wd1m");
    expect(projectToken("")).toBe("");
  });

  it("matches a canonical id to its catalog package id", () => {
    expect(projectMatchesProduct("4wd4mcar", "4wd4m-basic")).toBe(true);
    expect(projectMatchesProduct("2wd1mcar", "2wd1m-basic")).toBe(true);
    expect(projectMatchesProduct("4wd4mcar", "2wd1m-basic")).toBe(false);
  });

  it("resolves the 4WD4M project to its package name and materials", () => {
    const project = resolveProject("4wd4mcar");
    expect(project.key).toBe("4wd4mcar");
    expect(project.label).toBe("Wireless 4WD Car");
    expect(project.product?.id).toBe("4wd4m-basic");
    expect(project.materials.length).toBeGreaterThan(0);
    expect(project.materials).toContain("ESP32 Dev Module");
  });

  it("matches hyphenated product ids whose id has no tier suffix", () => {
    const project = resolveProject("smartdustbin");
    expect(project.key).toBe("smartdustbin");
    expect(project.label).toBe("Smart Dustbin");
    expect(project.product?.id).toBe("smart-dustbin");
    expect(project.materials).toContain("HC-SR04 ultrasonic sensor");
  });

  it("keeps projects the catalog does not know as their own card", () => {
    const project = resolveProject("lineFollower");
    expect(project.key).toBe("lineFollower");
    expect(project.label).toBe("Line Follower");
    expect(project.product).toBeNull();
    expect(project.materials).toEqual([]);
  });

  it("groups unreported devices under one labelled card", () => {
    expect(resolveProject(null)).toMatchObject({
      key: "unknown",
      label: "Unassigned devices",
      materials: [],
    });
    expect(resolveProject("  ").key).toBe("unknown");
  });
});
