import type { PreparedAttachment } from "@/lib/chat/attachments";
import type { ChatMessage, ProviderSettings, ProviderTestResult, SelectedModelTestResult } from "@/lib/chat/types";

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export function modelsUrl(endpoint: string): string {
  const normalized = normalizeEndpoint(endpoint);
  return normalized.endsWith("/chat/completions")
    ? `${normalized.slice(0, -"/chat/completions".length)}/models`
    : `${normalized}/models`;
}

export function chatCompletionsUrl(endpoint: string): string {
  const normalized = normalizeEndpoint(endpoint);
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function providerError(status: number, statusText: string, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    return parsed.error?.message ?? parsed.message ?? `${status} ${statusText}`;
  } catch {
    return body.slice(0, 180) || `${status} ${statusText}`;
  }
}

export function normalizeModelCatalog(data: Array<{ id?: string }> | undefined): string[] {
  return Array.from(new Set((data ?? []).map((model) => model.id?.trim()).filter((id): id is string => Boolean(id)))).sort((left, right) => left.localeCompare(right));
}

export function extractCompletionText(payloadText: string): string {
  try {
    const payload = JSON.parse(payloadText) as { choices?: Array<{ message?: { content?: unknown }; delta?: { content?: unknown }; text?: unknown }> };
    const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.text;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((part) => typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "").join("");
    }
    return "";
  } catch {
    return "";
  }
}

function messageContent(message: ChatMessage, currentAttachments: PreparedAttachment[]) {
  const textAttachments = currentAttachments.filter((attachment) => attachment.kind === "text");
  const imageAttachments = currentAttachments.filter((attachment) => attachment.kind === "image" && attachment.imageDataUrl);
  const unsupportedAttachments = currentAttachments.filter((attachment) => attachment.kind === "other");
  const textParts = [message.content];
  for (const attachment of textAttachments) {
    textParts.push(`\n\nAttached text file: ${attachment.name}\n---\n${attachment.textContent || ""}\n---`);
  }
  for (const attachment of unsupportedAttachments) {
    textParts.push(`\n\nThe user attached ${attachment.name} (${attachment.mimeType}). This provider integration can include text and image files directly; acknowledge that this file is attached but cannot read its binary contents.`);
  }
  const text = textParts.join("");
  if (!imageAttachments.length) return text;
  return [
    { type: "text", text },
    ...imageAttachments.map((attachment) => ({ type: "image_url", image_url: { url: attachment.imageDataUrl } })),
  ];
}

export function combineAssistantInstructions(assistantPersonality?: string, systemInstruction?: string): string | undefined {
  const parts = [
    assistantPersonality?.trim() ? `Default assistant personality: ${assistantPersonality.trim()}` : "",
    systemInstruction?.trim() ? `Conversation-specific instruction: ${systemInstruction.trim()}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

function requestMessages(messages: ChatMessage[], systemInstruction?: string) {
  return [
    ...(systemInstruction?.trim() ? [{ role: "system", content: systemInstruction.trim() }] : []),
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

export async function testProviderConnection(settings: ProviderSettings, apiKey: string): Promise<ProviderTestResult> {
  const endpoint = normalizeEndpoint(settings.endpoint);
  if (!endpoint) return { ok: false, status: 0, message: "Enter an API endpoint first.", models: [] };
  if (!apiKey.trim()) return { ok: false, status: 0, message: "Enter an API key first.", models: [] };
  try {
    const response = await fetch(modelsUrl(endpoint), { method: "GET", headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) return { ok: false, status: response.status, message: providerError(response.status, response.statusText, body), models: [] };
    const parsed = JSON.parse(body) as { data?: Array<{ id?: string }> };
    const models = normalizeModelCatalog(parsed.data);
    const selectedModel = settings.model.trim();
    const selectionFeedback = selectedModel
      ? models.includes(selectedModel)
        ? ` “${selectedModel}” is listed by this live catalog.`
        : ` “${selectedModel}” is not returned by this live catalog; select a listed model or verify provider access.`
      : "";
    return { ok: true, status: response.status, message: models.length ? `Connection confirmed. ${models.length} current model${models.length === 1 ? "" : "s"} returned.${selectionFeedback}` : "Connection confirmed, but this provider returned no model IDs. Enter a model identifier manually.", models };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : "The connection could not be completed.", models: [] };
  }
}

export async function testSelectedChatModel(settings: ProviderSettings, apiKey: string): Promise<SelectedModelTestResult> {
  const endpoint = normalizeEndpoint(settings.endpoint);
  const model = settings.model.trim();
  if (!endpoint) return { ok: false, status: 0, model, message: "Enter an API endpoint first." };
  if (!apiKey.trim()) return { ok: false, status: 0, model, message: "Enter an API key first." };
  if (!model) return { ok: false, status: 0, model, message: "Select or enter a model identifier first." };
  try {
    const response = await fetch(chatCompletionsUrl(endpoint), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, temperature: 0, stream: false }),
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, status: response.status, model, message: providerError(response.status, response.statusText, body) };
    const output = extractCompletionText(body);
    if (!output.trim()) return { ok: false, status: response.status, model, message: "This model completed the request but returned no chat text. Choose a chat/instruct model instead." };
    return { ok: true, status: response.status, model, message: `Model replied successfully: “${output.trim().slice(0, 80)}”` };
  } catch (error) {
    return { ok: false, status: 0, model, message: error instanceof Error ? error.message : "The selected model could not be tested." };
  }
}

export async function generatePromptSuggestions({
  settings,
  apiKey,
  messages,
  systemInstruction,
  assistantPersonality,
  signal,
}: {
  settings: ProviderSettings;
  apiKey: string;
  messages: ChatMessage[];
  systemInstruction?: string;
  assistantPersonality?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: settings.model.trim(),
      stream: false,
      temperature: 0.6,
      max_tokens: 220,
      messages: [
        { role: "system", content: `Based on the conversation, return only a JSON array of 3 to 5 concise, useful next prompts the user could send. Do not include markdown or commentary. ${combineAssistantInstructions(assistantPersonality, systemInstruction) ?? ""}`.trim() },
        ...requestMessages(messages),
      ],
    }),
  });
  if (!response.ok) throw new Error(providerError(response.status, response.statusText, await response.text()));
  const text = extractCompletionText(await response.text()).trim();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 5);
  } catch {
    // Fall through for providers that return a newline list instead of JSON.
  }
  return text.split(/\n+/).map((item) => item.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 5);
}

export async function streamChatCompletion({
  settings,
  apiKey,
  messages,
  currentAttachments,
  systemInstruction,
  assistantPersonality,
  signal,
  onDelta,
}: {
  settings: ProviderSettings;
  apiKey: string;
  messages: ChatMessage[];
  currentAttachments: PreparedAttachment[];
  systemInstruction?: string;
  assistantPersonality?: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<void> {
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: [
        ...(combineAssistantInstructions(assistantPersonality, systemInstruction) ? [{ role: "system", content: combineAssistantInstructions(assistantPersonality, systemInstruction)! }] : []),
        ...messages.map((message, index) => ({
          role: message.role,
          content: index === messages.length - 1 && message.role === "user" ? messageContent(message, currentAttachments) : message.content,
        })),
      ],
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(providerError(response.status, response.statusText, await response.text()));
  const text = extractCompletionText(await response.text());
  if (!text.trim()) throw new Error("The selected model completed the request but returned no chat text. Test a different chat/instruct model in Configuration.");
  onDelta(text);
}
