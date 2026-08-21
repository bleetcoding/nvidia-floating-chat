export const DEFAULT_ENDPOINT = "https://integrate.api.nvidia.com/v1";

export type ChatRole = "user" | "assistant" | "system";

export type AttachmentKind = "image" | "text" | "other";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  uri: string;
  kind: AttachmentKind;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  systemInstruction?: string;
}

export interface ProviderSettings {
  endpoint: string;
  model: string;
  lastTestedAt?: string;
  lastVerifiedModel?: string;
  assistantPersonality?: string;
  overlayContextEnabled?: boolean;
  overlayVoiceEnabled?: boolean;
  overlayPanelHeightDp?: number;
}

export interface ProviderTestResult {
  ok: boolean;
  status: number;
  message: string;
  models: string[];
}

export interface SelectedModelTestResult {
  ok: boolean;
  status: number;
  message: string;
  model: string;
}

export const defaultProviderSettings: ProviderSettings = {
  endpoint: DEFAULT_ENDPOINT,
  model: "",
  assistantPersonality: "Helpful, warm, concise, and practical. Match the user’s language and give clear next steps.",
  overlayContextEnabled: false,
  overlayVoiceEnabled: false,
  overlayPanelHeightDp: 380,
};

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createConversation(systemInstruction?: string): Conversation {
  const timestamp = new Date().toISOString();
  return {
    id: createId("chat"),
    title: "New conversation",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
    systemInstruction: systemInstruction?.trim() || undefined,
  };
}
