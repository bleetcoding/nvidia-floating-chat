import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("Expo SDK 54 native dependencies", () => {
  it("keeps launch-critical native modules on the SDK 54 compatibility range", () => {
    const dependencies = packageJson.dependencies;
    expect(dependencies["expo-clipboard"]).toMatch(/^[~^]8\.0\./);
    expect(dependencies["expo-document-picker"]).toMatch(/^[~^]14\.0\./);
    expect(dependencies["expo-asset"]).toMatch(/^[~^]12\.0\./);
  });
});
