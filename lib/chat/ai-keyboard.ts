import { NativeModules, Platform } from "react-native";

type NativeKeyboardBridge = {
  updateConfiguration: (endpoint: string, model: string, apiKey: string) => Promise<boolean>;
  openSettings: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
};

const bridge = NativeModules.FloatingAIKeyboard as NativeKeyboardBridge | undefined;

export const aiKeyboard = {
  isSupported: Platform.OS === "android" && Boolean(bridge),
  async updateConfiguration(endpoint: string, model: string, apiKey: string): Promise<boolean> {
    return bridge ? bridge.updateConfiguration(endpoint, model, apiKey) : false;
  },
  async openSettings(): Promise<boolean> {
    return bridge ? bridge.openSettings() : false;
  },
  async isEnabled(): Promise<boolean> {
    return bridge ? bridge.isEnabled() : false;
  },
};
