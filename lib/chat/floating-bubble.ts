import { NativeModules, Platform } from "react-native";

export type BubbleAppearance = {
  sizeDp: number;
  color: string;
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
};
