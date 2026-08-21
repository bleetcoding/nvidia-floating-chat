# Floating AI Chat for Android

Floating AI Chat is an Android-first, OpenAI-compatible chat client with a persistent floating bubble. It ships with NVIDIA's integration endpoint pre-filled as `https://integrate.api.nvidia.com/v1`; the API key and model remain user-configurable in the application.

## What it includes

| Area | Included behavior |
| --- | --- |
| **Provider setup** | Configurable base endpoint, secure local API-key storage, model discovery, manual model entry, and a connection test. |
| **Chat** | Local conversation history, new chats, token streaming, cancellation, copyable/selectable text, edit-and-resend, and regenerate. |
| **Attachments** | System document picker for images and text files, with selected attachments only sent alongside the user message. |
| **Floating bubble** | A draggable Android system overlay paired with a foreground service notification; tapping the bubble returns to the chat. |
| **Privacy** | Conversations remain on-device. The configured provider receives a connection test or prompt only after the user explicitly triggers that action. |

## Local development

Install dependencies with `pnpm install`, run `pnpm check` for TypeScript validation, and launch the project with `pnpm android` for an Android development build. The actual system overlay requires a compiled Android binary, because it uses Android's display-over-other-apps permission and a native foreground service.

## Building an APK on GitHub

The repository contains `.github/workflows/android-apk.yml`. Pushing to `main` or manually running the **Build Android APK** workflow compiles a release APK. Download the `floating-ai-chat-release-apk` artifact from the completed workflow run.

> The floating bubble is user-controlled. Android shows a persistent notification while it is active and requires the user to grant display-over-other-apps permission.

## Repository safety

Never commit a provider API key. The client intentionally has no build-time API key or server-side secret; each device stores its own configured key in platform secure storage.
