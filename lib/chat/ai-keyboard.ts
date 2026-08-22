import { NativeModules, Platform } from "react-native";

type NativeKeyboardBridge = {
  updateConfiguration: (endpoint: string, model: string, apiKey: string, personality: string, keyboardHeightDp: number, keyboardKeyScale: number, keyboardActionRows: number, contextPromptDelayMs: number) => Promise<boolean>;
  openSettings: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
  isSelected: () => Promise<boolean>;
  openPicker: () => Promise<boolean>;
};

const bridge = NativeModules.FloatingAIKeyboard as NativeKeyboardBridge | undefined;

export const aiKeyboard = {
  isSupported: Platform.OS === "android" && Boolean(bridge),
  async updateConfiguration(endpoint: string, model: string, apiKey: string, personality: string, keyboardHeightDp: number, keyboardKeyScale: number, keyboardActionRows: number, contextPromptDelayMs: number): Promise<boolean> {
    return bridge ? bridge.updateConfiguration(endpoint, model, apiKey, personality, keyboardHeightDp, keyboardKeyScale, keyboardActionRows, contextPromptDelayMs) : false;
  },
  async openSettings(): Promise<boolean> {
    return bridge ? bridge.openSettings() : false;
  },
  async isEnabled(): Promise<boolean> {
    return bridge ? bridge.isEnabled() : false;
  },
  async isSelected(): Promise<boolean> {
    return bridge ? bridge.isSelected() : false;
  },
  async openPicker(): Promise<boolean> {
    return bridge ? bridge.openPicker() : false;
  },
};
