# Native Assistant Architecture

## Scope and Platform Boundary

Android does not allow a third-party app to insert controls into another keyboard's prediction strip. The assistant therefore registers **Floating AI Keyboard** as a user-enabled Android input method. When selected in Android’s keyboard picker, it supplies a complete compact QWERTY layout together with an AI candidate/action row. The original keyboard remains available through Android’s input-method switcher.

The keyboard never processes password, PIN, or other sensitive text fields. For eligible fields, it reads only the selected text or a bounded window immediately before the cursor, then sends that explicit rewrite context to the user-configured model only when the user taps a style or grammar action. It replaces the selected text through Android’s input connection after the user accepts the generated result.

## Components

| Component | Responsibility | User control |
| --- | --- | --- |
| **Main app** | Stores endpoint/model/key, sets an optional per-conversation instruction, generates prompt suggestions, and controls keyboard defaults. | The user saves connection details and chooses default rewrite behavior. |
| **Compact overlay panel** | Opens above the current app from the bubble, shows a short conversation view and prompt field, and can be dismissed without leaving the current app. | The user enables display-over-other-apps and can close the panel. |
| **Android input method** | Supplies normal keys, AI style actions, a custom-instruction prompt, grammar fixing, result preview, and replace/copy/close actions. | The user explicitly enables and selects Floating AI Keyboard in Android settings. |
| **Provider bridge** | Mirrors only the user-saved connection values into app-private native configuration protected with an Android-keystore AES key for keyboard access. | Configuration is cleared or updated when the user changes provider settings. |

## Keyboard Interaction

The candidate row contains **Friendly**, **Professional**, **Grammar**, and **More**. More exposes **Sarcastic**, **Sad**, **Indirect**, **Direct**, **Witty**, and **Custom**. Custom opens a small native prompt for instructions such as “make it concise but warm.” The selected text is preferred; otherwise a bounded text window before the cursor is used. The result is shown in a dismissible panel with **Replace**, **Copy**, and **Close**. A **Chat** action opens a compact assistant panel while keeping the current application visible behind it.

## Conversation Interaction

Starting a chat presents an optional instruction field. When populated, it is sent as a system instruction for that conversation only. In a conversation, the **Ideas** control requests three to five concise next-prompt suggestions from the configured model using the existing local message history. Tapping a suggestion places it directly in the composer for user review and submission.

## Platform References

The keyboard uses Android’s `InputMethodService` model, declares the required input-method service metadata, and uses `InputConnection` to obtain the selected or nearby text and commit an accepted rewrite. The native implementation deliberately avoids password/PIN variations.

- Android Developers, [Creating an Input Method](https://android-developers.googleblog.com/2009/04/creating-input-method.html)
- Android Developers, [InputConnection API reference](https://developer.android.com/reference/android/view/inputmethod/InputConnection)
