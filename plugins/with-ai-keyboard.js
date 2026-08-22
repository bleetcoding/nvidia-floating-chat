const { createRunOncePlugin, withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "with-ai-keyboard";

function keyboardManifest(config) {
  return withAndroidManifest(config, (config) => {
    const permissions = config.modResults.manifest["uses-permission"] || [];
    if (!permissions.some((permission) => permission.$?.["android:name"] === "android.permission.INTERNET")) {
      permissions.push({ $: { "android:name": "android.permission.INTERNET" } });
    }
    config.modResults.manifest["uses-permission"] = permissions;
    const application = config.modResults.manifest.application?.[0];
    if (!application) throw new Error("Android application manifest node was not found.");
    const services = application.service || [];
    if (!services.some((service) => service.$?.["android:name"] === ".FloatingAIKeyboardService")) {
      services.push({
        $: {
          "android:name": ".FloatingAIKeyboardService",
          "android:exported": "true",
          "android:label": "Floating AI Keyboard",
          "android:permission": "android.permission.BIND_INPUT_METHOD",
        },
        "intent-filter": [{ action: [{ $: { "android:name": "android.view.InputMethod" } }] }],
        "meta-data": [{ $: { "android:name": "android.view.im", "android:resource": "@xml/floating_ai_keyboard" } }],
      });
    }
    application.service = services;
    return config;
  });
}

function javaSources(packageName) {
  const packagePath = packageName.replace(/\./g, "/");
  const config = `package ${packageName};

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class FloatingAIKeyboardConfig {
  private static final String PREFS = "floating_ai_keyboard";
  private static final String KEY_ALIAS = "floating_ai_keyboard_v1";
  private static final String TRANSFORMATION = "AES/GCM/NoPadding";
  private FloatingAIKeyboardConfig() {}
  private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
  private static SecretKey key() throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore"); keyStore.load(null);
    if (!keyStore.containsAlias(KEY_ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
      generator.generateKey();
    }
    return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
  }
  private static String encrypt(String value) throws Exception {
    Cipher cipher = Cipher.getInstance(TRANSFORMATION); cipher.init(Cipher.ENCRYPT_MODE, key());
    byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)); byte[] iv = cipher.getIV();
    return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
  }
  private static String decrypt(String value) throws Exception {
    String[] parts = value.split(":", 2); if (parts.length != 2) return "";
    Cipher cipher = Cipher.getInstance(TRANSFORMATION); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
    return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
  }
  public static void save(Context context, String endpoint, String model, String apiKey, String personality, String keyboardHeightDp, String keyboardKeyScale, String keyboardActionRows, String contextPromptDelayMs) throws Exception {
    prefs(context).edit().putString("endpoint", encrypt(endpoint == null ? "" : endpoint)).putString("model", encrypt(model == null ? "" : model)).putString("apiKey", encrypt(apiKey == null ? "" : apiKey)).putString("personality", encrypt(personality == null ? "" : personality)).putString("keyboardHeightDp", encrypt(keyboardHeightDp == null ? "350" : keyboardHeightDp)).putString("keyboardKeyScale", encrypt(keyboardKeyScale == null ? "1" : keyboardKeyScale)).putString("keyboardActionRows", encrypt(keyboardActionRows == null ? "1" : keyboardActionRows)).putString("contextPromptDelayMs", encrypt(contextPromptDelayMs == null ? "6500" : contextPromptDelayMs)).apply();
  }
  public static String get(Context context, String name) {
    try { return decrypt(prefs(context).getString(name, "")); } catch (Exception ignored) { return ""; }
  }
}`;

  const keyboard = `package ${packageName};

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.inputmethodservice.InputMethodService;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class FloatingAIKeyboardService extends InputMethodService {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Handler main = new Handler(Looper.getMainLooper());
  private LinearLayout root; private LinearLayout resultPanel; private LinearLayout promptCards; private LinearLayout keysArea; private TextView resultText; private TextView activeAppLabel; private EditText customInput; private EditText chatInput; private String activePackage = ""; private String pendingSource = ""; private String pendingBefore = ""; private String pendingAfter = ""; private boolean pendingSelection = false; private boolean sensitiveField = false; private boolean symbolsMode = false; private boolean capsMode = false; private String stableContext = ""; private long contextChangedAt = 0L; private String promptedContext = ""; private int contextGeneration = 0;
  private final int background = Color.rgb(20, 32, 38); private final int surface = Color.rgb(35, 50, 57); private final int accent = Color.rgb(118, 185, 0); private final int text = Color.rgb(241, 246, 241); private final int muted = Color.rgb(181, 193, 188);

  private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + .5f); }
  private int configInt(String key, int fallback) { try { return Math.round(Float.parseFloat(FloatingAIKeyboardConfig.get(this, key))); } catch (Exception ignored) { return fallback; } }
  private float configFloat(String key, float fallback) { try { return Float.parseFloat(FloatingAIKeyboardConfig.get(this, key)); } catch (Exception ignored) { return fallback; } }
  private android.content.SharedPreferences layoutPrefs() { return getSharedPreferences("floating_ai_keyboard", Context.MODE_PRIVATE); }
  private String layoutPrefix() { return "layout." + activePackage.replaceAll("[^A-Za-z0-9._-]", "_"); }
  private int keyboardHeightDp() { return activePackage.isEmpty() ? configInt("keyboardHeightDp", 350) : layoutPrefs().getInt(layoutPrefix() + ".height", configInt("keyboardHeightDp", 350)); }
  private float keyboardScale() { return activePackage.isEmpty() ? configFloat("keyboardKeyScale", 1f) : layoutPrefs().getFloat(layoutPrefix() + ".scale", configFloat("keyboardKeyScale", 1f)); }
  private int keyHeight() { float heightRatio = Math.max(.82f, Math.min(1.24f, keyboardHeightDp() / 350f)); return Math.round(dp(48) * heightRatio * Math.max(.82f, Math.min(1.2f, keyboardScale()))); }
  private String plain(String value) { if (value == null) return ""; String tick = Character.toString((char) 96); String cleaned = value.replace(tick + tick + tick, "").replace(tick, "").replace("**", "").replace("__", "").replace("*", "").replace("_", "").replace("|", " ").replace("# ", ""); while (cleaned.contains("  ")) cleaned = cleaned.replace("  ", " "); return cleaned.trim(); }
  private GradientDrawable shape(int color, int radius) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable; }
  private TextView button(String label, int color) { TextView view = new TextView(this); view.setText(label); view.setTextColor(color == accent ? Color.rgb(8, 16, 0) : text); view.setTextSize(13 * Math.max(.85f, Math.min(1.15f, keyboardScale()))); view.setTypeface(Typeface.DEFAULT_BOLD); view.setGravity(Gravity.CENTER); view.setPadding(dp(7), dp(7), dp(7), dp(7)); view.setBackground(shape(color, 11)); return view; }
  private void addRow(LinearLayout parent, String letters) { LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER); row.setPadding(dp(2), dp(2), dp(2), dp(2)); for (char c : letters.toCharArray()) { TextView key = button(String.valueOf(c), surface); key.setTextSize(18 * Math.max(.85f, Math.min(1.15f, keyboardScale()))); key.setOnClickListener(v -> commit(((TextView) v).getText().toString())); row.addView(key, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); } parent.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)); }

  @Override public View onCreateInputView() {
    root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(6), dp(6), dp(6), dp(6)); root.setBackgroundColor(background);
    LinearLayout promptHeader = new LinearLayout(this); promptHeader.setGravity(Gravity.CENTER_VERTICAL); activeAppLabel = button("AI keyboard", background); activeAppLabel.setTextColor(muted); activeAppLabel.setTextSize(11); activeAppLabel.setContentDescription("Active app using Floating AI Keyboard"); promptHeader.addView(activeAppLabel, new LinearLayout.LayoutParams(0, dp(28), 1f)); TextView saveLayout = button("Save layout", surface); saveLayout.setContentDescription("Save this keyboard size for the active app"); saveLayout.setOnClickListener(v -> saveLayoutForActiveApp()); promptHeader.addView(saveLayout, new LinearLayout.LayoutParams(dp(92), dp(28))); TextView refreshCards = button("Refresh", surface); refreshCards.setContentDescription("Refresh contextual prompt cards now"); refreshCards.setOnClickListener(v -> refreshPromptCards()); promptHeader.addView(refreshCards, new LinearLayout.LayoutParams(dp(72), dp(28))); root.addView(promptHeader);
    promptCards = new LinearLayout(this); promptCards.setGravity(Gravity.CENTER_VERTICAL); promptCards.setPadding(0, 0, 0, dp(5)); promptCards.setVisibility(View.GONE); root.addView(promptCards);
    LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.CENTER_VERTICAL);
    addAction(actions, "Rewrite", "Rewrite the text to be clear, natural, and concise.", true); addAction(actions, "Grammar", "Fix grammar, spelling, and punctuation. Preserve the user's voice.", true); addAction(actions, "Friendly", "Rewrite the text in a friendly, warm tone.", true); addAction(actions, "Pro", "Rewrite the text in a concise, professional tone.", true);
    TextView more = button("More", surface); more.setOnClickListener(v -> showMore()); actions.addView(more, new LinearLayout.LayoutParams(0, keyHeight(), 1f));
    TextView chat = button("Chat", accent); chat.setOnClickListener(v -> toggleChat()); actions.addView(chat, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); root.addView(actions);
    if (configInt("keyboardActionRows", 1) > 1) { LinearLayout extra = new LinearLayout(this); extra.setGravity(Gravity.CENTER_VERTICAL); addAction(extra, "Direct", "Rewrite the text to be direct and clear."); addAction(extra, "Witty", "Rewrite the text to be witty but easy to understand."); addAction(extra, "Custom", "Use the custom instruction field if present, otherwise make the rewrite concise."); root.addView(extra); }
    customInput = new EditText(this); customInput.setSingleLine(); customInput.setHint("Custom rewrite instruction"); customInput.setHintTextColor(muted); customInput.setTextColor(text); customInput.setTextSize(13); customInput.setBackground(shape(surface, 10)); customInput.setPadding(dp(10), 0, dp(10), 0); customInput.setVisibility(View.GONE); root.addView(customInput, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(43)));
    chatInput = new EditText(this); chatInput.setSingleLine(); chatInput.setHint("Ask the assistant…"); chatInput.setHintTextColor(muted); chatInput.setTextColor(text); chatInput.setTextSize(13); chatInput.setBackground(shape(surface, 10)); chatInput.setPadding(dp(10), 0, dp(10), 0); chatInput.setVisibility(View.GONE); root.addView(chatInput, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(43)));
    resultPanel = new LinearLayout(this); resultPanel.setOrientation(LinearLayout.VERTICAL); resultPanel.setPadding(dp(10), dp(8), dp(10), dp(8)); resultPanel.setBackground(shape(Color.rgb(25, 43, 27), 12)); resultPanel.setVisibility(View.GONE);
    resultText = new TextView(this); resultText.setTextColor(text); resultText.setTextSize(13); resultText.setMaxLines(6); resultPanel.addView(resultText);
    LinearLayout resultActions = new LinearLayout(this); resultActions.setPadding(0, dp(6), 0, 0); TextView replace = button("Replace", accent); replace.setOnClickListener(v -> replaceCurrent()); TextView copy = button("Copy", surface); copy.setOnClickListener(v -> copyResult()); TextView close = button("×", surface); close.setOnClickListener(v -> resultPanel.setVisibility(View.GONE)); resultActions.addView(replace, new LinearLayout.LayoutParams(0, dp(38), 2f)); resultActions.addView(copy, new LinearLayout.LayoutParams(0, dp(38), 1f)); resultActions.addView(close, new LinearLayout.LayoutParams(0, dp(38), 1f)); resultPanel.addView(resultActions); root.addView(resultPanel);
    keysArea = new LinearLayout(this); keysArea.setOrientation(LinearLayout.VERTICAL); root.addView(keysArea); renderKeyRows();
    LinearLayout bottom = new LinearLayout(this); TextView language = button("◎", surface); language.setContentDescription("Switch keyboard language or input method"); language.setOnClickListener(v -> switchLanguage()); language.setOnLongClickListener(v -> { showLanguagePicker(); return true; }); TextView shift = button("⇧", surface); shift.setOnClickListener(v -> { capsMode = !capsMode; renderKeyRows(); }); TextView symbols = button("123", surface); symbols.setOnClickListener(v -> { symbolsMode = !symbolsMode; renderKeyRows(); ((TextView) v).setText(symbolsMode ? "ABC" : "123"); }); TextView space = button("space", surface); space.setOnClickListener(v -> commit(" ")); TextView back = button("⌫", surface); back.setOnClickListener(v -> backspace()); TextView enter = button("↵", accent); enter.setOnClickListener(v -> performEnter()); bottom.addView(language, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); bottom.addView(shift, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); bottom.addView(symbols, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); bottom.addView(space, new LinearLayout.LayoutParams(0, keyHeight(), 2f)); bottom.addView(back, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); bottom.addView(enter, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); root.addView(bottom);
    return root;
  }

  private void addAction(LinearLayout row, String label, String instruction) { addAction(row, label, instruction, false); }
  private void addAction(LinearLayout row, String label, String instruction, boolean replaceAfter) { TextView action = button(label, surface); action.setContentDescription(label + " selected text with AI"); action.setOnClickListener(v -> rewrite(instruction, replaceAfter)); row.addView(action, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); }
  private void renderKeyRows() { if (keysArea == null) return; keysArea.removeAllViews(); if (symbolsMode) { addRow(keysArea, "1234567890"); addRow(keysArea, "-/:;()$&@%"); addRow(keysArea, "#=+_.,?!"); } else { String first = capsMode ? "QWERTYUIOP" : "qwertyuiop"; String second = capsMode ? "ASDFGHJKL" : "asdfghjkl"; String third = capsMode ? "ZXCVBNM" : "zxcvbnm"; addRow(keysArea, first); addRow(keysArea, second); addRow(keysArea, third); } }
  private void refreshPromptCards() { if (sensitiveField) { showResult("Suggestions are disabled in password and PIN fields.", false); return; } String snapshot = plain(FloatingTextContextService.visibleText(1400) + "\\n" + sourceText()); if (snapshot.isEmpty()) { if (promptCards != null) promptCards.setVisibility(View.GONE); showResult("No permitted visible text is available to refresh suggestions.", false); return; } stableContext = snapshot; contextChangedAt = SystemClock.elapsedRealtime(); promptedContext = snapshot; requestPromptCards(snapshot); }
  private void showLanguagePicker() { InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE); if (manager != null) manager.showInputMethodPicker(); }
  private void switchLanguage() { try { if (switchToNextInputMethod(false)) return; } catch (Exception ignored) { } showLanguagePicker(); }
  private void showMore() { LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); addAction(row, "Sarcastic", "Rewrite the text with light, harmless sarcasm."); addAction(row, "Sad", "Rewrite the text in a gentle, sad, reflective tone."); addAction(row, "Indirect", "Rewrite the text to be polite and indirect while preserving its meaning."); addAction(row, "Direct", "Rewrite the text to be direct and clear."); root.addView(row, 1); LinearLayout secondRow = new LinearLayout(this); secondRow.setGravity(Gravity.CENTER_VERTICAL); addAction(secondRow, "Witty", "Rewrite the text to be witty but easy to understand."); TextView custom = button("Custom", accent); custom.setOnClickListener(v -> { customInput.setVisibility(customInput.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE); if (customInput.getVisibility() == View.VISIBLE) customInput.requestFocus(); }); secondRow.addView(custom, new LinearLayout.LayoutParams(0, keyHeight(), 1f)); root.addView(secondRow, 2); }
  private boolean isSensitive(EditorInfo info) { int variation = info.inputType & InputType.TYPE_MASK_VARIATION; return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD || variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD; }
  private void updateActiveApp(EditorInfo info) { activePackage = info == null || info.packageName == null ? "" : info.packageName; if (activeAppLabel == null) return; String[] parts = activePackage.split("\\\\."); String label = parts.length == 0 || activePackage.isEmpty() ? "AI keyboard" : parts[parts.length - 1]; activeAppLabel.setText("AI in " + label); }
  private void saveLayoutForActiveApp() { if (activePackage.isEmpty()) return; layoutPrefs().edit().putInt(layoutPrefix() + ".height", keyboardHeightDp()).putFloat(layoutPrefix() + ".scale", keyboardScale()).apply(); if (activeAppLabel != null) activeAppLabel.setText("Layout saved for " + activePackage.substring(activePackage.lastIndexOf('.') + 1)); }
  @Override public void onStartInputView(EditorInfo info, boolean restarting) { super.onStartInputView(info, restarting); updateActiveApp(info); renderKeyRows(); sensitiveField = isSensitive(info); pendingSource = ""; pendingBefore = ""; pendingAfter = ""; pendingSelection = false; contextGeneration++; if (promptCards != null) promptCards.setVisibility(View.GONE); if (!sensitiveField) pollStableContext(); }
  private void pollStableContext() { final int generation = contextGeneration; final String snapshot = plain(FloatingTextContextService.visibleText(1400) + "\\n" + sourceText()); if (snapshot.isEmpty()) { main.postDelayed(() -> { if (generation == contextGeneration) pollStableContext(); }, 700); return; } if (!snapshot.equals(stableContext)) { stableContext = snapshot; contextChangedAt = SystemClock.elapsedRealtime(); promptedContext = ""; } long delay = Math.max(5000, Math.min(8000, configInt("contextPromptDelayMs", 6500))); long elapsed = SystemClock.elapsedRealtime() - contextChangedAt; if (elapsed < delay) { main.postDelayed(() -> { if (generation == contextGeneration) pollStableContext(); }, delay - elapsed); return; } if (!snapshot.equals(promptedContext)) { promptedContext = snapshot; requestPromptCards(snapshot); } }
  private void requestPromptCards(String context) { String endpoint = FloatingAIKeyboardConfig.get(this, "endpoint"); String model = FloatingAIKeyboardConfig.get(this, "model"); String apiKey = FloatingAIKeyboardConfig.get(this, "apiKey"); if (endpoint.isEmpty() || model.isEmpty() || apiKey.isEmpty()) return; worker.execute(() -> { try { String url = endpoint.replaceAll("/+$", "") + "/chat/completions"; JSONObject payload = new JSONObject(); payload.put("model", model); payload.put("stream", false); payload.put("max_tokens", 160); JSONArray messages = new JSONArray(); messages.put(new JSONObject().put("role", "system").put("content", "Return exactly a JSON array of three short plain-text reply suggestions. Never use markdown, bullets, stars, pipes, tables, or explanations.")); messages.put(new JSONObject().put("role", "user").put("content", "Create three useful replies or prompts from this stable text context:\\n" + context)); payload.put("messages", messages); HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection(); connection.setRequestMethod("POST"); connection.setConnectTimeout(15000); connection.setReadTimeout(25000); connection.setRequestProperty("Authorization", "Bearer " + apiKey); connection.setRequestProperty("Content-Type", "application/json"); connection.setDoOutput(true); try (OutputStream output = connection.getOutputStream()) { output.write(payload.toString().getBytes("UTF-8")); } int status = connection.getResponseCode(); BufferedReader reader = new BufferedReader(new InputStreamReader(status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream())); StringBuilder body = new StringBuilder(); String line; while ((line = reader.readLine()) != null) body.append(line); if (status < 200 || status >= 300) return; JSONObject json = new JSONObject(body.toString()); String raw = json.optJSONArray("choices").optJSONObject(0).optJSONObject("message").optString("content", "").trim(); JSONArray cards = new JSONArray(raw); main.post(() -> showPromptCards(cards)); } catch (Exception ignored) { } }); }
  private void showPromptCards(JSONArray cards) { if (promptCards == null || cards == null) return; promptCards.removeAllViews(); for (int i = 0; i < Math.min(3, cards.length()); i++) { String suggestion = plain(cards.optString(i, "")); if (suggestion.isEmpty()) continue; TextView card = button(suggestion, Color.rgb(35, 50, 57)); card.setTextSize(11); card.setMaxLines(2); card.setContentDescription("Insert suggested reply " + (i + 1)); card.setOnClickListener(v -> commit(((TextView) v).getText().toString())); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, keyHeight(), 1f); if (promptCards.getChildCount() > 0) params.setMargins(dp(4), 0, 0, 0); promptCards.addView(card, params); } promptCards.setVisibility(promptCards.getChildCount() > 0 ? View.VISIBLE : View.GONE); }
  private void commit(String value) { InputConnection connection = getCurrentInputConnection(); if (connection != null) { connection.beginBatchEdit(); connection.commitText(value, 1); connection.finishComposingText(); connection.endBatchEdit(); } }
  private void performEnter() { InputConnection connection = getCurrentInputConnection(); if (connection != null && connection.performEditorAction(getCurrentInputEditorInfo().imeOptions & EditorInfo.IME_MASK_ACTION)) return; sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER); }
  private void backspace() { InputConnection connection = getCurrentInputConnection(); if (connection == null) return; CharSequence selected = connection.getSelectedText(0); if (selected != null && selected.length() > 0) connection.commitText("", 1); else connection.deleteSurroundingText(1, 0); }
  private String sourceText() { InputConnection connection = getCurrentInputConnection(); if (connection == null) return ""; CharSequence selected = connection.getSelectedText(0); if (selected != null && selected.length() > 0) { pendingSelection = true; pendingSource = selected.toString(); pendingBefore = ""; pendingAfter = ""; return pendingSource; } CharSequence before = connection.getTextBeforeCursor(700, 0); CharSequence after = connection.getTextAfterCursor(80, 0); pendingSelection = false; pendingBefore = before == null ? "" : before.toString(); pendingAfter = after == null ? "" : after.toString(); pendingSource = pendingBefore; return pendingSource; }
  private void rewrite(String instruction) { rewrite(instruction, false); }
  private void rewrite(String instruction, boolean replaceAfter) { if (sensitiveField) { showResult("AI rewrite is disabled in password and PIN fields.", false); return; } String custom = customInput.getText().toString().trim(); if (!custom.isEmpty()) instruction = custom; String source = sourceText(); if (source.trim().isEmpty()) { showResult("Select text or place the cursor after the text you want to rewrite.", false); return; } pendingSource = source; runModel("Rewrite the following text. Return only the rewritten text. Instruction: " + instruction + "\\n\\nText:\\n" + source, true, replaceAfter); }
  private void toggleChat() { if (chatInput.getVisibility() == View.VISIBLE) { askChat(); return; } chatInput.setVisibility(View.VISIBLE); chatInput.requestFocus(); chatInput.setOnEditorActionListener((v, actionId, event) -> { askChat(); return true; }); }
  private void askChat() { String question = chatInput.getText().toString().trim(); if (question.isEmpty()) { showResult("Type a question in the assistant field first.", false); return; } pendingSource = ""; runModel(question, false); chatInput.setText(""); }
  private void runModel(String prompt, boolean rewrite) { runModel(prompt, rewrite, false); }
  private void runModel(String prompt, boolean rewrite, boolean replaceAfter) { String endpoint = FloatingAIKeyboardConfig.get(this, "endpoint"); String model = FloatingAIKeyboardConfig.get(this, "model"); String apiKey = FloatingAIKeyboardConfig.get(this, "apiKey"); if (endpoint.isEmpty() || model.isEmpty() || apiKey.isEmpty()) { showResult("Open Floating AI Chat and save a tested model before using the keyboard assistant.", false); return; } showResult("Working…", false); worker.execute(() -> { try { String url = endpoint.endsWith("/chat/completions") ? endpoint : endpoint.replaceAll("/+$", "") + "/chat/completions"; JSONObject payload = new JSONObject(); payload.put("model", model); payload.put("stream", false); payload.put("max_tokens", rewrite ? 400 : 600); JSONArray messages = new JSONArray(); String personality = FloatingAIKeyboardConfig.get(this, "personality"); messages.put(new JSONObject().put("role", "system").put("content", (rewrite ? "You are a precise writing assistant." : "You are a concise helpful assistant.") + " Personality: " + personality + " Return plain text only. Never use markdown, stars, pipes, tables, headings, code fences, or decorative formatting.")); messages.put(new JSONObject().put("role", "user").put("content", prompt)); payload.put("messages", messages); HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection(); connection.setRequestMethod("POST"); connection.setConnectTimeout(20000); connection.setReadTimeout(30000); connection.setRequestProperty("Authorization", "Bearer " + apiKey); connection.setRequestProperty("Content-Type", "application/json"); connection.setDoOutput(true); try (OutputStream output = connection.getOutputStream()) { output.write(payload.toString().getBytes("UTF-8")); } int status = connection.getResponseCode(); BufferedReader reader = new BufferedReader(new InputStreamReader(status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream())); StringBuilder body = new StringBuilder(); String line; while ((line = reader.readLine()) != null) body.append(line); if (status < 200 || status >= 300) throw new Exception(body.toString()); JSONObject json = new JSONObject(body.toString()); String answer = plain(json.optJSONArray("choices").optJSONObject(0).optJSONObject("message").optString("content", "")); if (answer.isEmpty()) throw new Exception("The selected model returned no chat text."); main.post(() -> showResult(answer, rewrite, replaceAfter)); } catch (Exception error) { main.post(() -> showResult("AI request failed: " + error.getMessage(), false)); } }); }
  private void showResult(String value, boolean replaceable) { showResult(value, replaceable, false); }
  private void showResult(String value, boolean replaceable, boolean replaceAfter) { resultText.setText(plain(value)); resultPanel.setTag(replaceable); resultPanel.setVisibility(View.VISIBLE); if (replaceAfter && replaceable) main.post(() -> replaceCurrent()); }
  private void replaceCurrent() { if (!(resultPanel.getTag() instanceof Boolean) || !((Boolean) resultPanel.getTag())) return; InputConnection connection = getCurrentInputConnection(); if (connection == null) return; String replacement = plain(resultText.getText().toString()); boolean applied = false; connection.beginBatchEdit(); connection.finishComposingText(); CharSequence selected = connection.getSelectedText(0); if (selected != null && selected.length() > 0) applied = connection.commitText(replacement, 1); else if (!pendingBefore.isEmpty()) { CharSequence currentBefore = connection.getTextBeforeCursor(pendingBefore.length() + 24, 0); if (currentBefore != null && currentBefore.toString().endsWith(pendingBefore)) { applied = connection.deleteSurroundingText(pendingBefore.length(), 0) && connection.commitText(replacement, 1); } } connection.endBatchEdit(); if (applied) resultPanel.setVisibility(View.GONE); else { copyResult(); resultPanel.setVisibility(View.GONE); } }
  private void copyResult() { ((ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("AI rewrite", resultText.getText())); }
  @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}`;

  const module = `package ${packageName};

import android.content.Intent;
import android.provider.Settings;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class FloatingAIKeyboardModule extends ReactContextBaseJavaModule {
  FloatingAIKeyboardModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "FloatingAIKeyboard"; }
  @ReactMethod public void updateConfiguration(String endpoint, String model, String apiKey, String personality, double keyboardHeightDp, double keyboardKeyScale, double keyboardActionRows, double contextPromptDelayMs, Promise promise) { try { FloatingAIKeyboardConfig.save(getReactApplicationContext(), endpoint, model, apiKey, personality, String.valueOf(keyboardHeightDp), String.valueOf(keyboardKeyScale), String.valueOf(keyboardActionRows), String.valueOf(contextPromptDelayMs)); promise.resolve(true); } catch (Exception error) { promise.reject("KEYBOARD_CONFIGURATION_FAILED", error); } }
  @ReactMethod public void openSettings(Promise promise) { Intent intent = new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getReactApplicationContext().startActivity(intent); promise.resolve(true); }
  @ReactMethod public void isEnabled(Promise promise) { String enabled = Settings.Secure.getString(getReactApplicationContext().getContentResolver(), Settings.Secure.ENABLED_INPUT_METHODS); promise.resolve(enabled != null && enabled.contains(getReactApplicationContext().getPackageName() + "/." + FloatingAIKeyboardService.class.getSimpleName())); }
}`;

  const packageSource = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class FloatingAIKeyboardPackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) { List<NativeModule> modules = new ArrayList<>(); modules.add(new FloatingAIKeyboardModule(context)); return modules; }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
}`;
  return { packagePath, config, keyboard, module, packageSource };
}

function withKeyboardSources(config) {
  return withDangerousMod(config, ["android", async (config) => {
    const packageName = config.android?.package;
    if (!packageName) throw new Error("Android package name is required for Floating AI Keyboard integration.");
    const sources = javaSources(packageName);
    const javaDirectory = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "java", sources.packagePath);
    const xmlDirectory = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
    fs.mkdirSync(javaDirectory, { recursive: true }); fs.mkdirSync(xmlDirectory, { recursive: true });
    fs.writeFileSync(path.join(javaDirectory, "FloatingAIKeyboardConfig.java"), sources.config);
    fs.writeFileSync(path.join(javaDirectory, "FloatingAIKeyboardService.java"), sources.keyboard);
    fs.writeFileSync(path.join(javaDirectory, "FloatingAIKeyboardModule.java"), sources.module);
    fs.writeFileSync(path.join(javaDirectory, "FloatingAIKeyboardPackage.java"), sources.packageSource);
    fs.writeFileSync(path.join(xmlDirectory, "floating_ai_keyboard.xml"), "<input-method xmlns:android=\"http://schemas.android.com/apk/res/android\" />");
    return config;
  }]);
}

function withKeyboardPackage(config) {
  return withMainApplication(config, (config) => {
    const packageName = config.android?.package;
    if (!packageName) throw new Error("Android package name is required for Floating AI Keyboard integration.");
    const importLine = `import ${packageName}.FloatingAIKeyboardPackage`;
    if (!config.modResults.contents.includes(importLine)) config.modResults.contents = config.modResults.contents.replace(/(package [^\n]+\n)/, `$1\n${importLine}\n`);
    if (!config.modResults.contents.includes("FloatingAIKeyboardPackage()")) config.modResults.contents = config.modResults.contents.replace(/(PackageList\(this\)\.packages\.apply \{)/, "$1\n      add(FloatingAIKeyboardPackage())");
    return config;
  });
}

module.exports = createRunOncePlugin((config) => withKeyboardPackage(withKeyboardSources(keyboardManifest(config))), PLUGIN_NAME, "1.3.0");
