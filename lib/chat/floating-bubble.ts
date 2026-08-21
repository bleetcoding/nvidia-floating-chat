import { NativeModules, Platform } from "react-native";

type FloatingBubbleBridge = {
  isOverlayPermissionGranted: () => Promise<boolean>;
  isBubbleEnabled: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<boolean>;
  startBubble: () => Promise<boolean>;
  stopBubble: () => Promise<boolean>;
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
  async requestPermission(): Promise<boolean> {
    return bridge ? bridge.requestOverlayPermission() : false;
  },
  async start(): Promise<boolean> {
    return bridge ? bridge.startBubble() : false;
  },
  async stop(): Promise<boolean> {
    return bridge ? bridge.stopBubble() : false;
  },
};
