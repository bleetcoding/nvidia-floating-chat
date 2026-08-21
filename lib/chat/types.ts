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
}

export interface ProviderSettings {
  endpoint: string;
  model: string;
  lastTestedAt?: string;
  lastVerifiedModel?: string;
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
};

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createConversation(): Conversation {
  const timestamp = new Date().toISOString();
  return {
    id: createId("chat"),
    title: "New conversation",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}
