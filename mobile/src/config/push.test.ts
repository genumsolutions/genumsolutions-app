import { describe, it, expect, vi } from "vitest";

vi.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { eas: { projectId: "app-json-project" } },
    },
  },
}));

import { resolvePushProjectId } from "./push";

describe("resolvePushProjectId", () => {
  it("uses the env var when set", () => {
    expect(resolvePushProjectId("env-project", "app-json-project")).toBe(
      "env-project",
    );
  });

  it("falls back to the app.json project id when env var is empty", () => {
    expect(resolvePushProjectId("", "app-json-project")).toBe(
      "app-json-project",
    );
  });

  it("falls back to the app.json project id when env var is undefined", () => {
    expect(resolvePushProjectId(undefined, "app-json-project")).toBe(
      "app-json-project",
    );
  });
});
