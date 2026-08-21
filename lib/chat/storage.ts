import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { aiKeyboard } from "@/lib/chat/ai-keyboard";
import {
  type Conversation,
  defaultProviderSettings,
  type ProviderSettings,
} from "@/lib/chat/types";

const SETTINGS_KEY = "nvidia-floating-chat.settings.v1";
const CHATS_KEY = "nvidia-floating-chat.conversations.v1";
const API_KEY_KEY = "nvidia-floating-chat.api-key.v1";

async function readValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function writeValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultProviderSettings;
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return {
      ...defaultProviderSettings,
      ...parsed,
    };
  } catch {
    return defaultProviderSettings;
  }
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadApiKey(): Promise<string> {
  return (await readValue(API_KEY_KEY)) ?? "";
}

export async function saveApiKey(apiKey: string): Promise<void> {
  if (!apiKey.trim()) {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(API_KEY_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(API_KEY_KEY);
    return;
  }
  await writeValue(API_KEY_KEY, apiKey.trim());
}

export async function syncKeyboardConfiguration(settings: ProviderSettings, apiKey: string): Promise<void> {
  if (!aiKeyboard.isSupported) return;
  const canUseChat = Boolean(settings.endpoint.trim() && settings.model.trim() && settings.lastVerifiedModel === settings.model && apiKey.trim());
  await aiKeyboard.updateConfiguration(
    canUseChat ? settings.endpoint.trim() : "",
    canUseChat ? settings.model.trim() : "",
    canUseChat ? apiKey.trim() : "",
    settings.assistantPersonality ?? defaultProviderSettings.assistantPersonality ?? "Helpful, warm, concise, and practical.",
    settings.keyboardHeightDp ?? defaultProviderSettings.keyboardHeightDp ?? 350,
    settings.keyboardKeyScale ?? defaultProviderSettings.keyboardKeyScale ?? 1,
    settings.keyboardActionRows ?? defaultProviderSettings.keyboardActionRows ?? 1,
    settings.contextPromptDelayMs ?? defaultProviderSettings.contextPromptDelayMs ?? 6500,
  );
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(conversations));
}
