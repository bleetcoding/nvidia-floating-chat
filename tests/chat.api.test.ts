import { describe, expect, it } from "vitest";

import { chatCompletionsUrl, combineAssistantInstructions, extractCompletionText, modelsUrl, normalizeEndpoint, normalizeModelCatalog } from "../lib/chat/api";

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

  it("keeps every unique provider model ID in stable catalog order", () => {
    expect(normalizeModelCatalog([{ id: "zeta" }, { id: "alpha" }, { id: "zeta" }, {}, { id: " beta " }])).toEqual(["alpha", "beta", "zeta"]);
  });

  it("extracts a non-streamed OpenAI-compatible assistant completion for Android fallback transport", () => {
    expect(extractCompletionText(JSON.stringify({ choices: [{ message: { content: "Hello from the provider" } }] }))).toBe("Hello from the provider");
  });

  it("also accepts text-style completion payloads from compatible providers", () => {
    expect(extractCompletionText(JSON.stringify({ choices: [{ text: "OK" }] }))).toBe("OK");
  });

  it("composes the global assistant personality with an optional chat-specific instruction", () => {
    expect(combineAssistantInstructions("Warm and concise", "Use short answers")).toBe("Default assistant personality: Warm and concise\n\nConversation-specific instruction: Use short answers");
    expect(combineAssistantInstructions("Warm and concise")).toBe("Default assistant personality: Warm and concise");
  });
});
