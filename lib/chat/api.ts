import type { PreparedAttachment } from "@/lib/chat/attachments";
import type { ChatMessage, ProviderSettings, ProviderTestResult } from "@/lib/chat/types";

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
    const payload = JSON.parse(payloadText) as { choices?: Array<{ message?: { content?: unknown }; delta?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.delta?.content;
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

export async function streamChatCompletion({
  settings,
  apiKey,
  messages,
  currentAttachments,
  signal,
  onDelta,
}: {
  settings: ProviderSettings;
  apiKey: string;
  messages: ChatMessage[];
  currentAttachments: PreparedAttachment[];
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<void> {
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: messages.map((message, index) => ({
        role: message.role,
        content: index === messages.length - 1 && message.role === "user" ? messageContent(message, currentAttachments) : message.content,
      })),
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(providerError(response.status, response.statusText, await response.text()));
  if (!response.body || typeof response.body.getReader !== "function") {
    const fallbackText = extractCompletionText(await response.text());
    if (!fallbackText) throw new Error("The provider completed the request but returned no assistant text.");
    onDelta(fallbackText);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawResponse = "";
  let emittedText = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const decoded = decoder.decode(value, { stream: true });
    rawResponse += decoded;
    buffer += decoded;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = payload.choices?.[0]?.delta?.content;
        if (delta) {
          emittedText = true;
          onDelta(delta);
        }
      } catch {
        // Ignore non-JSON keep-alive events emitted by compatible providers.
      }
    }
  }
  if (!emittedText) {
    const fallbackText = extractCompletionText(rawResponse);
    if (!fallbackText) throw new Error("The provider completed the request but returned no assistant text.");
    onDelta(fallbackText);
  }
}
