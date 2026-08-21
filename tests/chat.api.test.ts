import { describe, expect, it } from "vitest";

import { chatCompletionsUrl, modelsUrl, normalizeEndpoint } from "../lib/chat/api";

describe("OpenAI-compatible provider URL helpers", () => {
  it("normalizes a base URL without trailing slashes", () => {
    expect(normalizeEndpoint("https://integrate.api.nvidia.com/v1///")).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("builds NVIDIA's model discovery URL from the default base endpoint", () => {
    expect(modelsUrl("https://integrate.api.nvidia.com/v1")).toBe("https://integrate.api.nvidia.com/v1/models");
  });

  it("preserves an explicitly supplied completions URL", () => {
    expect(chatCompletionsUrl("https://provider.example/v1/chat/completions")).toBe("https://provider.example/v1/chat/completions");
    expect(modelsUrl("https://provider.example/v1/chat/completions")).toBe("https://provider.example/v1/models");
  });
});
