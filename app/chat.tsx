import { Redirect } from "expo-router";

/**
 * Receives the Android floating-bubble deep link and returns to the primary
 * conversation workspace instead of leaving the user on an unmatched route.
 */
export default function FloatingBubbleChatRoute() {
  return <Redirect href="/" />;
}
