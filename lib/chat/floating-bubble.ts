import { NativeModules, Platform } from "react-native";

export type BubbleAppearance = {
  sizeDp: number;
  color: string;
};

export type OverlayPreferences = {
  title: string;
  excerpt: string;
  personality: string;
  contextEnabled: boolean;
  notificationAssistantEnabled: boolean;
  voiceEnabled: boolean;
  panelHeightDp: number;
  panelWidthDp: number;
  panelOpacity: number;
  perAppLayoutsEnabled: boolean;
  contextExclusionsEnabled: boolean;
  contextExcludedPackages: string;
};

export const defaultBubbleAppearance: BubbleAppearance = {
  sizeDp: 58,
  color: "#76B900",
};

type FloatingBubbleBridge = {
  isOverlayPermissionGranted: () => Promise<boolean>;
  isBubbleEnabled: () => Promise<boolean>;
  getAppearance: () => Promise<BubbleAppearance>;
  requestOverlayPermission: () => Promise<boolean>;
  startBubble: () => Promise<boolean>;
  stopBubble: () => Promise<boolean>;
  updateAppearance: (sizeDp: number, color: string) => Promise<boolean>;
  updateOverlayPreview: (title: string, excerpt: string) => Promise<boolean>;
  updateOverlayPreferences: (title: string, excerpt: string, personality: string, contextEnabled: boolean, notificationAssistantEnabled: boolean, voiceEnabled: boolean, panelHeightDp: number, panelWidthDp: number, panelOpacity: number, perAppLayoutsEnabled: boolean, contextExclusionsEnabled: boolean, contextExcludedPackages: string) => Promise<boolean>;
  openAccessibilitySettings: () => Promise<boolean>;
  isAccessibilityEnabled: () => Promise<boolean>;
};

const bridge = NativeModules.FloatingBubble as FloatingBubbleBridge | undefined;

export const floatingBubble = {
  isSupported: Platform.OS === "android" && Boolean(bridge),
  async hasPermission(): Promise<boolean> {
    return bridge ? bridge.isOverlayPermissionGranted() : false;
  },
  async isEnabled(): Promise<boolean> {
    return bridge ? bridge.isBubbleEnabled() : false;
  },
  async getAppearance(): Promise<BubbleAppearance> {
    return bridge ? bridge.getAppearance() : defaultBubbleAppearance;
  },
  async requestPermission(): Promise<boolean> {
    return bridge ? bridge.requestOverlayPermission() : false;
  },
  async start(): Promise<boolean> {
    return bridge ? bridge.startBubble() : false;
  },
  async stop(): Promise<boolean> {
    return bridge ? bridge.stopBubble() : false;
  },
  async updateAppearance(appearance: BubbleAppearance): Promise<boolean> {
    return bridge ? bridge.updateAppearance(appearance.sizeDp, appearance.color) : false;
  },
  async updateOverlayPreview(title: string, excerpt: string): Promise<boolean> {
    return bridge ? bridge.updateOverlayPreview(title, excerpt) : false;
  },
  async updateOverlayPreferences(preferences: OverlayPreferences): Promise<boolean> {
    return bridge ? bridge.updateOverlayPreferences(preferences.title, preferences.excerpt, preferences.personality, preferences.contextEnabled, preferences.notificationAssistantEnabled, preferences.voiceEnabled, preferences.panelHeightDp, preferences.panelWidthDp, preferences.panelOpacity, preferences.perAppLayoutsEnabled, preferences.contextExclusionsEnabled, preferences.contextExcludedPackages) : false;
  },
  async openAccessibilitySettings(): Promise<boolean> {
    return bridge ? bridge.openAccessibilitySettings() : false;
  },
  async isAccessibilityEnabled(): Promise<boolean> {
    return bridge ? bridge.isAccessibilityEnabled() : false;
  },
};
