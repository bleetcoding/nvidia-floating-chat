# NVIDIA Floating AI Chat — Mobile Interface Design

## Product Intent

NVIDIA Floating AI Chat is an Android-first assistant that remains available above other apps through a small, movable overlay bubble. The primary experience is deliberately compact: the user opens the bubble, reads or writes a message one-handed, and returns to the task beneath it without navigating through a full-screen assistant. The companion application provides setup, chat-history management, and a clear control center for privacy-sensitive API credentials.

## Platform Architecture

The application uses Expo/React Native for the primary interface and a small Android-native integration compiled from the source repository. That integration owns the system overlay permission, a foreground notification/service, and the clickable floating bubble. The overlay opens the app into the current conversation; the full app remains the place to configure the provider and manage history. Conversations are stored locally, with API keys held in the Android keystore through secure storage. The default endpoint is `https://integrate.api.nvidia.com/v1`, using an OpenAI-compatible chat-completions request format.

## Screen List

| Screen | Primary content and functionality | One-handed layout |
| --- | --- | --- |
| **Chats** | A reverse-chronological list of local conversations, a prominent **New chat** control, service/overlay status, and a shortcut to settings. | New-chat button sits in the thumb zone above the bottom navigation; rows expose an overflow menu without requiring long presses. |
| **Chat** | Streaming message transcript, editable draft, attachment chips, send/stop action, and message actions for copy, edit-and-resend, regenerate, and select text. | Composer is fixed immediately above the navigation area; send and attachment controls are aligned to the right and left of the draft field. |
| **Connection & Model** | Endpoint URL, API key field, model selector/input, connection-test result, and a save action. The NVIDIA endpoint is pre-filled. | Form uses full-width fields and an always-visible test button after required values are present. |
| **Floating Bubble** | A small draggable branded round bubble that opens the active chat on tap and supports a dismissal/stop area when dragged. | Persistent, single-tap entry point intended for use while another app is open. |
| **Overlay Permission** | Explains display-over-other-apps access, foreground-service notification behavior, and a system-settings launch button. | A single primary action; the app reflects the returned permission state. |
| **Conversation Detail Menu** | Rename, delete, export/copy transcript, and start a fresh chat. | Presented as a bottom sheet so actions are close to the user’s thumb. |

## Primary User Flows

The setup flow begins on **Chats**. A new user opens **Connection & Model**, keeps the NVIDIA endpoint or enters an OpenAI-compatible provider URL, pastes an API key, selects or enters a model identifier, and taps **Test connection**. A successful test enables the chat composer and persists the configuration securely on the device.

The conversation flow begins when the user taps **New chat** or the floating bubble. They write a prompt, optionally attach a supported document or image, and send it. The assistant response appears token by token. During streaming, the send control becomes **Stop**. Once complete, the response can be selected and copied, or the user can choose **Edit & resend** to place the original prompt back into the composer.

The overlay flow begins from **Chats** by turning on the bubble. If required, the user grants Android display-over-other-apps permission. A foreground service keeps the bubble available when the app is backgrounded, with an ongoing notification that lets Android communicate that availability. Tapping the bubble opens the most recent or active chat. Turning the bubble off stops the service and removes the overlay.

## Information and Data Model

| Entity | Fields | Storage |
| --- | --- | --- |
| **ProviderSettings** | endpoint, model, configuredAt, connectionStatus | Local application storage; API key separately in secure storage. |
| **Conversation** | id, title, createdAt, updatedAt, messages | Local application storage. |
| **Message** | id, role, content, createdAt, attachment metadata, stream state | Embedded in its conversation. |
| **Attachment** | id, name, MIME type, URI, byte size, extracted text/status | Temporary URI plus local metadata; content is sent only with the user’s explicit message submission. |
| **OverlayState** | enabled, permissionGranted, activeConversationId | Local application storage, synchronized with the Android-native service state. |

## Visual Language and Color Choices

The brand uses an **obsidian canvas** (`#09110E`) to visually recede behind a working task, with **NVIDIA green** (`#76B900`) as the clear action and availability signal. Surfaces use graphite (`#121A16`) and raised pine (`#18221C`) to create a quiet layered effect without relying on heavy shadows. Primary text is mist (`#F2F7F1`), secondary text is sage (`#9AA89B`), and borders are moss (`#2C3A30`). The streaming cursor and connection-success states use a brighter lime accent (`#B5E853`) for unmistakable feedback. Errors use warm coral (`#FF7262`) rather than red to remain legible against the dark interface.

## Accessibility and Interaction Rules

The interface targets a 9:16 portrait screen with no critical control smaller than 44 dp. All icon actions include labels for screen readers. Transcripts remain selectable so AI output is directly copyable; copy actions additionally send content to the system clipboard. The app never displays API keys after the user leaves the field, and provider settings label remote calls clearly before a connection test or message is sent.

