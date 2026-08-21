import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";

import { ScreenContainer } from "@/components/screen-container";
import { attachmentSummary, selectAttachments, toStoredAttachment, type PreparedAttachment } from "@/lib/chat/attachments";
import { streamChatCompletion, testProviderConnection } from "@/lib/chat/api";
import { defaultBubbleAppearance, floatingBubble, type BubbleAppearance } from "@/lib/chat/floating-bubble";
import {
  loadApiKey,
  loadConversations,
  loadProviderSettings,
  saveApiKey,
  saveConversations,
  saveProviderSettings,
} from "@/lib/chat/storage";
import {
  createConversation,
  defaultProviderSettings,
  type ChatMessage,
  type Conversation,
  type ProviderSettings,
  type ProviderTestResult,
} from "@/lib/chat/types";

type Screen = "library" | "conversation" | "settings";

const colors = {
  background: "#09110E",
  surface: "#121A16",
  elevated: "#18221C",
  primary: "#76B900",
  lime: "#B5E853",
  text: "#F2F7F1",
  muted: "#9AA89B",
  border: "#2C3A30",
  danger: "#FF7262",
};

const BUBBLE_SIZES = [
  { label: "Small", sizeDp: 48 },
  { label: "Standard", sizeDp: 58 },
  { label: "Large", sizeDp: 72 },
];

const BUBBLE_COLORS = [
  { label: "NVIDIA green", value: "#76B900" },
  { label: "Sky", value: "#42A5F5" },
  { label: "Violet", value: "#A78BFA" },
  { label: "Coral", value: "#FF7262" },
  { label: "Amber", value: "#F5B942" },
];

function dateLabel(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, role, content, createdAt: new Date().toISOString() };
}

export default function HomeScreen() {
  const [screen, setScreen] = useState<Screen>("library");
  const [settings, setSettings] = useState<ProviderSettings>(defaultProviderSettings);
  const [apiKey, setApiKey] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [bubbleEnabled, setBubbleEnabled] = useState(false);
  const [bubbleAppearance, setBubbleAppearance] = useState<BubbleAppearance>(defaultBubbleAppearance);
  const hydrated = useRef(false);

  useEffect(() => {
    Promise.all([loadProviderSettings(), loadApiKey(), loadConversations(), floatingBubble.isEnabled(), floatingBubble.getAppearance()])
      .then(([savedSettings, savedKey, savedConversations, savedBubbleEnabled, savedBubbleAppearance]) => {
        setSettings(savedSettings);
        setApiKey(savedKey);
        setConversations(savedConversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        setBubbleEnabled(savedBubbleEnabled);
        setBubbleAppearance(savedBubbleAppearance);
      })
      .finally(() => {
        hydrated.current = true;
        setIsReady(true);
      });
  }, []);

  useEffect(() => {
    if (hydrated.current) void saveConversations(conversations);
  }, [conversations]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );
  const configured = Boolean(apiKey && settings.endpoint && settings.model);

  const saveSettings = async () => {
    const normalized = { ...settings, endpoint: settings.endpoint.trim().replace(/\/+$/, ""), model: settings.model.trim() };
    await Promise.all([saveProviderSettings(normalized), saveApiKey(apiKey)]);
    setSettings(normalized);
    Alert.alert("Saved locally", "Your API key is kept in device secure storage.");
  };

  const runTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testProviderConnection(settings, apiKey);
    setIsTesting(false);
    setTestResult(result);
    if (result.ok) {
      setDiscoveredModels(result.models);
      const nextSettings = { ...settings, lastTestedAt: new Date().toISOString(), model: settings.model || result.models[0] || "" };
      setSettings(nextSettings);
      await Promise.all([saveProviderSettings(nextSettings), saveApiKey(apiKey)]);
    }
  };

  const newConversation = () => {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setScreen("conversation");
  };

  const updateMessages = (conversationId: string, messages: ChatMessage[]) => {
    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
      return {
        ...conversation,
        title: firstUserMessage ? firstUserMessage.slice(0, 46) : conversation.title,
        messages,
        updatedAt: new Date().toISOString(),
      };
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  };

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    setScreen("conversation");
  };

  const deleteConversation = (conversation: Conversation) => {
    Alert.alert("Delete conversation?", `“${conversation.title}” will be removed from this device.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setConversations((current) => current.filter((item) => item.id !== conversation.id)) },
    ]);
  };

  const toggleBubble = async () => {
    if (!floatingBubble.isSupported) {
      Alert.alert("Android build required", "The system-wide bubble runs in the compiled Android app. It is not available in the development preview.");
      return;
    }
    try {
      if (bubbleEnabled) {
        await floatingBubble.stop();
        setBubbleEnabled(false);
        return;
      }
      if (!(await floatingBubble.hasPermission())) {
        await floatingBubble.requestPermission();
        Alert.alert("Grant display-over-other-apps access", "Enable the permission in Android settings, return here, then turn on the bubble.");
        return;
      }
      await floatingBubble.start();
      setBubbleEnabled(true);
    } catch (error) {
      Alert.alert("Bubble could not start", error instanceof Error ? error.message : "Check Android overlay permission and try again.");
    }
  };

  const applyBubbleAppearance = async (appearance: BubbleAppearance) => {
    setBubbleAppearance(appearance);
    if (!floatingBubble.isSupported) return;
    try {
      await floatingBubble.updateAppearance(appearance);
    } catch (error) {
      Alert.alert("Appearance could not update", error instanceof Error ? error.message : "Try another bubble size or color.");
    }
  };

  if (!isReady) {
    return <ScreenContainer containerClassName="bg-background" className="items-center justify-center"><StatusBar style="light" /><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading your local workspace…</Text></ScreenContainer>;
  }

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5" edges={["top", "left", "right", "bottom"]}>
      <StatusBar style="light" />
      {screen === "library" ? <ConversationLibrary conversations={conversations} configured={configured} bubbleEnabled={bubbleEnabled} bubbleAppearance={bubbleAppearance} onCreate={newConversation} onOpen={openConversation} onDelete={deleteConversation} onOpenSettings={() => setScreen("settings")} onToggleBubble={() => void toggleBubble()} onAppearanceChange={(appearance) => void applyBubbleAppearance(appearance)} /> : null}
      {screen === "conversation" ? <ConversationScreen conversation={activeConversation} settings={settings} apiKey={apiKey} configured={configured} onBack={() => setScreen("library")} onOpenSettings={() => setScreen("settings")} onUpdateMessages={updateMessages} /> : null}
      {screen === "settings" ? <SettingsScreen settings={settings} apiKey={apiKey} showKey={showKey} isTesting={isTesting} result={testResult} discoveredModels={discoveredModels} onBack={() => setScreen("library")} onSettingsChange={setSettings} onApiKeyChange={setApiKey} onShowKey={() => setShowKey((current) => !current)} onTest={() => void runTest()} onSave={() => void saveSettings()} /> : null}
    </ScreenContainer>
  );
}

function ConversationLibrary({ conversations, configured, bubbleEnabled, bubbleAppearance, onCreate, onOpen, onDelete, onOpenSettings, onToggleBubble, onAppearanceChange }: { conversations: Conversation[]; configured: boolean; bubbleEnabled: boolean; bubbleAppearance: BubbleAppearance; onCreate: () => void; onOpen: (conversation: Conversation) => void; onDelete: (conversation: Conversation) => void; onOpenSettings: () => void; onToggleBubble: () => void; onAppearanceChange: (appearance: BubbleAppearance) => void }) {
  return <View style={styles.flex}>
    <View style={styles.headerRow}><View><Text style={styles.eyebrow}>NVIDIA FLOATING CHAT</Text><Text style={styles.pageTitle}>Your conversations</Text></View><TouchableOpacity accessibilityLabel="Open connection settings" onPress={onOpenSettings} style={styles.iconButton}><Text style={styles.iconButtonText}>⚙</Text></TouchableOpacity></View>
    <View style={[styles.statusCard, configured ? styles.statusOnline : styles.statusAttention]}><View style={styles.statusDot} /><View style={styles.flex}><Text style={styles.statusTitle}>{configured ? "Ready to chat" : "Finish connection setup"}</Text><Text style={styles.statusDetail}>{configured ? "Your endpoint, model, and secure API key are configured on this device." : "Add an API key, test the provider, and choose a model before sending a message."}</Text></View>{!configured ? <TouchableOpacity accessibilityLabel="Configure connection" onPress={onOpenSettings} style={styles.statusAction}><Text style={styles.statusActionText}>Set up</Text></TouchableOpacity> : null}</View>
    <View style={bubbleStyles.card}><View style={bubbleStyles.badge}><Text style={bubbleStyles.badgeText}>AI</Text></View><View style={styles.flex}><Text style={bubbleStyles.title}>Display over other apps</Text><Text style={bubbleStyles.detail}>{bubbleEnabled ? "The movable bubble stays available while the app is backgrounded." : "Turn on a movable bubble for instant chat access above other apps."}</Text></View><TouchableOpacity accessibilityLabel={bubbleEnabled ? "Turn off floating bubble" : "Turn on floating bubble"} onPress={onToggleBubble} style={[bubbleStyles.toggle, bubbleEnabled && bubbleStyles.toggleOn]}><View style={[bubbleStyles.knob, bubbleEnabled && bubbleStyles.knobOn]} /></TouchableOpacity></View>
    <View style={appearanceStyles.panel}><View style={appearanceStyles.headingRow}><View style={styles.flex}><Text style={appearanceStyles.title}>Bubble appearance</Text><Text style={appearanceStyles.detail}>Changes are saved and apply immediately when the bubble is active.</Text></View><View style={[appearanceStyles.preview, { backgroundColor: bubbleAppearance.color, height: bubbleAppearance.sizeDp * 0.55, width: bubbleAppearance.sizeDp * 0.55 }]}><Text style={appearanceStyles.previewText}>AI</Text></View></View><Text style={appearanceStyles.label}>SIZE · {bubbleAppearance.sizeDp} DP</Text><View style={appearanceStyles.sizeRow}>{BUBBLE_SIZES.map((option) => <TouchableOpacity key={option.sizeDp} accessibilityLabel={`Set bubble size to ${option.label}`} onPress={() => onAppearanceChange({ ...bubbleAppearance, sizeDp: option.sizeDp })} style={[appearanceStyles.sizePill, bubbleAppearance.sizeDp === option.sizeDp && appearanceStyles.sizePillSelected]}><Text style={[appearanceStyles.sizeText, bubbleAppearance.sizeDp === option.sizeDp && appearanceStyles.sizeTextSelected]}>{option.label}</Text></TouchableOpacity>)}</View><Text style={appearanceStyles.label}>COLOR</Text><View style={appearanceStyles.colorRow}>{BUBBLE_COLORS.map((option) => <TouchableOpacity key={option.value} accessibilityLabel={`Set bubble color to ${option.label}`} onPress={() => onAppearanceChange({ ...bubbleAppearance, color: option.value })} style={[appearanceStyles.colorButton, bubbleAppearance.color === option.value && appearanceStyles.colorButtonSelected]}><View style={[appearanceStyles.colorSwatch, { backgroundColor: option.value }]} /></TouchableOpacity>)}</View></View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Local history</Text><Text style={styles.sectionCount}>{conversations.length}</Text></View>
    <FlatList data={conversations} keyExtractor={(item) => item.id} contentContainerStyle={conversations.length ? styles.listContent : styles.emptyContent} renderItem={({ item }) => <TouchableOpacity accessibilityLabel={`Open ${item.title}`} onPress={() => onOpen(item)} style={styles.conversationCard}><View style={styles.conversationGlyph}><Text style={styles.conversationGlyphText}>✦</Text></View><View style={styles.flex}><Text numberOfLines={1} style={styles.conversationTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.conversationPreview}>{item.messages.at(-1)?.content || "No messages yet"}</Text></View><View style={styles.conversationMeta}><Text style={styles.dateText}>{dateLabel(item.updatedAt)}</Text><TouchableOpacity accessibilityLabel={`Delete ${item.title}`} onPress={() => onDelete(item)} style={styles.deleteButton}><Text style={styles.deleteButtonText}>×</Text></TouchableOpacity></View></TouchableOpacity>} ListEmptyComponent={<View style={styles.emptyState}><View style={styles.emptyOrbit}><Text style={styles.emptyOrbitText}>✦</Text></View><Text style={styles.emptyTitle}>A clear workspace</Text><Text style={styles.emptyText}>Start a conversation here, then keep it close with the floating bubble.</Text></View>} />
    <TouchableOpacity accessibilityLabel="Start a new chat" onPress={onCreate} style={styles.primaryButton}><Text style={styles.primaryButtonText}>＋  New chat</Text></TouchableOpacity>
  </View>;
}

function ConversationScreen({ conversation, settings, apiKey, configured, onBack, onOpenSettings, onUpdateMessages }: { conversation: Conversation | null; settings: ProviderSettings; apiKey: string; configured: boolean; onBack: () => void; onOpenSettings: () => void; onUpdateMessages: (conversationId: string, messages: ChatMessage[]) => void }) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const pickAttachments = async () => {
    try {
      const selectedAttachments = await selectAttachments();
      setAttachments((current) => [...current, ...selectedAttachments]);
    }
    catch (error) { Alert.alert("Attachment unavailable", error instanceof Error ? error.message : "This file could not be prepared."); }
  };
  const copyMessage = async (message: ChatMessage) => { await Clipboard.setStringAsync(message.content); Alert.alert("Copied", "The message is ready to paste in another app."); };
  const stopStreaming = () => abortController.current?.abort();
  const send = async (replacement?: string) => {
    if (!conversation || isStreaming) return;
    if (!configured) { onOpenSettings(); return; }
    const content = (replacement ?? draft).trim() || (attachments.length ? "Please review the attached file." : "");
    if (!content) return;
    const userMessage = { ...createMessage("user", content), attachments: attachments.map(toStoredAttachment) };
    const assistantMessage = createMessage("assistant", "");
    const startingMessages = [...conversation.messages, userMessage, assistantMessage];
    onUpdateMessages(conversation.id, startingMessages);
    setDraft("");
    const pendingAttachments = attachments;
    setAttachments([]);
    setIsStreaming(true);
    const controller = new AbortController();
    abortController.current = controller;
    let response = "";
    try {
      await streamChatCompletion({ settings, apiKey, messages: [...conversation.messages, userMessage], currentAttachments: pendingAttachments, signal: controller.signal, onDelta: (delta: string) => { response += delta; onUpdateMessages(conversation.id, [...conversation.messages, userMessage, { ...assistantMessage, content: response }]); } });
      if (!response) onUpdateMessages(conversation.id, [...conversation.messages, userMessage, { ...assistantMessage, content: "The model completed without returning text." }]);
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? `${response || "Response"} [stopped]` : `I could not complete that request: ${error instanceof Error ? error.message : "Unknown provider error"}`;
      onUpdateMessages(conversation.id, [...conversation.messages, userMessage, { ...assistantMessage, content: message }]);
    } finally { abortController.current = null; setIsStreaming(false); }
  };

  if (!conversation) return <View style={styles.flex}><TouchableOpacity accessibilityLabel="Back to conversations" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity></View>;
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.headerRow}><TouchableOpacity accessibilityLabel="Back to conversations" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity><View style={styles.flex}><Text numberOfLines={1} style={styles.conversationHeading}>{conversation.title}</Text><Text style={styles.conversationSubheading}>{isStreaming ? "Streaming response…" : "Local conversation memory"}</Text></View><TouchableOpacity accessibilityLabel="Open connection settings" onPress={onOpenSettings} style={styles.iconButton}><Text style={styles.iconButtonText}>⚙</Text></TouchableOpacity></View>
    {!configured ? <TouchableOpacity onPress={onOpenSettings} style={styles.inlineSetup}><Text style={styles.inlineSetupText}>Configure a model to start chatting  →</Text></TouchableOpacity> : null}
    <FlatList ref={listRef} data={conversation.messages} keyExtractor={(item) => item.id} style={styles.messageList} contentContainerStyle={conversation.messages.length ? styles.messageListContent : styles.messageEmpty} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} renderItem={({ item, index }) => <MessageCard message={item} onCopy={() => void copyMessage(item)} onEdit={item.role === "user" ? () => setDraft(item.content) : undefined} onResend={item.role === "assistant" ? () => { const previous = conversation.messages.slice(0, index).reverse().find((message) => message.role === "user"); if (previous) void send(previous.content); } : undefined} />} ListEmptyComponent={<View style={styles.emptyState}><View style={styles.emptyOrbit}><Text style={styles.emptyOrbitText}>✦</Text></View><Text style={styles.emptyTitle}>What can I help with?</Text><Text style={styles.emptyText}>Messages are saved locally on this device. AI text stays selectable and easy to copy.</Text></View>} />
    {attachments.length ? <View style={styles.attachmentStrip}>{attachments.map((attachment) => <View key={attachment.id} style={styles.attachmentChip}><Text numberOfLines={1} style={styles.attachmentLabel}>{attachmentSummary(attachment)} · {attachment.name}</Text><TouchableOpacity accessibilityLabel={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><Text style={styles.attachmentRemove}>×</Text></TouchableOpacity></View>)}</View> : null}
    <View style={styles.composer}><TouchableOpacity accessibilityLabel="Attach file" disabled={isStreaming} onPress={() => void pickAttachments()} style={styles.attachButton}><Text style={styles.attachButtonText}>＋</Text></TouchableOpacity><TextInput accessibilityLabel="Message" editable={!isStreaming} multiline value={draft} onChangeText={setDraft} placeholder={configured ? "Message the model…" : "Configure your model to begin"} placeholderTextColor={colors.muted} style={styles.composerInput} /><TouchableOpacity accessibilityLabel={isStreaming ? "Stop response" : "Send message"} onPress={isStreaming ? stopStreaming : () => void send()} style={[styles.sendButton, isStreaming && styles.stopButton]}><Text style={styles.sendButtonText}>{isStreaming ? "■" : "↑"}</Text></TouchableOpacity></View>
  </KeyboardAvoidingView>;
}

function MessageCard({ message, onCopy, onEdit, onResend }: { message: ChatMessage; onCopy: () => void; onEdit?: () => void; onResend?: () => void }) {
  const isUser = message.role === "user";
  return <View style={[styles.messageWrap, isUser ? styles.messageWrapUser : styles.messageWrapAssistant]}><View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>{message.content ? <Text selectable style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>{message.content}</Text> : <View style={styles.typingRow}><View style={styles.typingDot} /><View style={styles.typingDot} /><View style={styles.typingDot} /></View>}{message.attachments?.length ? <View style={styles.sentAttachments}>{message.attachments.map((attachment) => <Text key={attachment.id} style={styles.sentAttachmentText}>⌁ {attachmentSummary(attachment)}: {attachment.name}</Text>)}</View> : null}</View><View style={styles.messageActions}><TouchableOpacity accessibilityLabel="Copy message" onPress={onCopy}><Text style={styles.messageActionText}>Copy</Text></TouchableOpacity>{onEdit ? <TouchableOpacity accessibilityLabel="Edit message" onPress={onEdit}><Text style={styles.messageActionText}>Edit</Text></TouchableOpacity> : null}{onResend ? <TouchableOpacity accessibilityLabel="Regenerate response" onPress={onResend}><Text style={styles.messageActionText}>Retry</Text></TouchableOpacity> : null}</View></View>;
}

function SettingsScreen({ settings, apiKey, showKey, isTesting, result, discoveredModels, onBack, onSettingsChange, onApiKeyChange, onShowKey, onTest, onSave }: { settings: ProviderSettings; apiKey: string; showKey: boolean; isTesting: boolean; result: ProviderTestResult | null; discoveredModels: string[]; onBack: () => void; onSettingsChange: (settings: ProviderSettings) => void; onApiKeyChange: (apiKey: string) => void; onShowKey: () => void; onTest: () => void; onSave: () => void }) {
  const [modelSearch, setModelSearch] = useState("");
  const matchingModels = discoveredModels.filter((model) => model.toLowerCase().includes(modelSearch.trim().toLowerCase()));

  return <View style={styles.flex}>
    <View style={styles.headerRow}><TouchableOpacity accessibilityLabel="Back to conversations" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity><View style={styles.flex}><Text style={styles.pageTitle}>Connection & model</Text><Text style={styles.headerDetail}>Direct, OpenAI-compatible provider setup</Text></View></View>
    <FlatList data={["settings"]} keyExtractor={(item) => item} showsVerticalScrollIndicator={false} renderItem={() => <View style={styles.settingsContent}>
      <Text style={styles.fieldLabel}>API endpoint</Text><TextInput accessibilityLabel="API endpoint" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={settings.endpoint} onChangeText={(endpoint) => onSettingsChange({ ...settings, endpoint })} placeholder="https://integrate.api.nvidia.com/v1" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.helperText}>NVIDIA’s endpoint is ready by default. You may replace it with another compatible provider.</Text>
      <Text style={styles.fieldLabel}>API key</Text><View style={styles.keyRow}><TextInput accessibilityLabel="API key" autoCapitalize="none" autoCorrect={false} secureTextEntry={!showKey} value={apiKey} onChangeText={onApiKeyChange} placeholder="Paste your provider key" placeholderTextColor={colors.muted} style={[styles.input, styles.keyInput]} /><TouchableOpacity accessibilityLabel={showKey ? "Hide API key" : "Show API key"} onPress={onShowKey} style={styles.revealButton}><Text style={styles.revealButtonText}>{showKey ? "Hide" : "Show"}</Text></TouchableOpacity></View><Text style={styles.helperText}>The key is stored in Android secure storage and is never shown in chat history.</Text>
      <View style={styles.fieldHeader}><Text style={styles.fieldLabel}>Model identifier</Text>{settings.lastTestedAt ? <Text style={styles.testedAt}>Tested {dateLabel(settings.lastTestedAt)}</Text> : null}</View><TextInput accessibilityLabel="Model identifier" autoCapitalize="none" autoCorrect={false} value={settings.model} onChangeText={(model) => onSettingsChange({ ...settings, model })} placeholder="Refresh catalog or enter a model ID" placeholderTextColor={colors.muted} style={styles.input} />
      {discoveredModels.length ? <View style={styles.modelList}><Text style={styles.discoveredLabel}>LIVE MODEL CATALOG · {discoveredModels.length}</Text><Text style={styles.helperText}>Every ID returned by the provider is shown. Search or scroll to select one.</Text><TextInput accessibilityLabel="Search live model catalog" autoCapitalize="none" autoCorrect={false} value={modelSearch} onChangeText={setModelSearch} placeholder="Search model IDs" placeholderTextColor={colors.muted} style={styles.input} />{matchingModels.length ? matchingModels.map((model) => <TouchableOpacity key={model} accessibilityLabel={`Select model ${model}`} onPress={() => onSettingsChange({ ...settings, model })} style={[styles.modelChip, settings.model === model && styles.modelChipSelected]}><Text numberOfLines={1} style={[styles.modelChipText, settings.model === model && styles.modelChipTextSelected]}>{model}</Text></TouchableOpacity>) : <Text style={styles.helperText}>No live model IDs match this search.</Text>}</View> : null}
      <TouchableOpacity accessibilityLabel="Refresh live model catalog" disabled={isTesting} onPress={onTest} style={[styles.testButton, isTesting && styles.buttonDisabled]}>{isTesting ? <ActivityIndicator color={colors.text} /> : <Text style={styles.testButtonText}>Refresh live model catalog</Text>}</TouchableOpacity>{result ? <View style={[styles.resultCard, result.ok ? styles.resultSuccess : styles.resultError]}><Text style={[styles.resultHeading, result.ok ? styles.resultHeadingSuccess : styles.resultHeadingError]}>{result.ok ? "Connection verified" : "Connection not verified"}</Text><Text style={styles.resultMessage}>{result.message}</Text></View> : null}
      <View style={styles.privacyCard}><Text style={styles.privacyTitle}>Privacy checkpoint</Text><Text style={styles.privacyText}>Refreshing the catalog sends only an authenticated request to the provider’s model list. Messages and chosen attachments are sent only when you press Send.</Text></View>
    </View>} ListFooterComponent={<TouchableOpacity accessibilityLabel="Save provider settings" onPress={onSave} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save connection settings</Text></TouchableOpacity>} />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 }, headerRow: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 22, marginTop: 4 }, eyebrow: { color: colors.lime, fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: 5 }, pageTitle: { color: colors.text, fontSize: 27, fontWeight: "800", letterSpacing: -0.6 }, headerDetail: { color: colors.muted, fontSize: 12, marginTop: 3 }, iconButton: { alignItems: "center", backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }, iconButtonText: { color: colors.text, fontSize: 20 }, statusCard: { alignItems: "center", borderRadius: 19, flexDirection: "row", gap: 10, marginBottom: 23, padding: 15 }, statusOnline: { backgroundColor: "#172719", borderColor: "#396534", borderWidth: 1 }, statusAttention: { backgroundColor: "#21281A", borderColor: "#59632D", borderWidth: 1 }, statusDot: { backgroundColor: colors.lime, borderRadius: 4, height: 8, width: 8 }, statusTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginBottom: 3 }, statusDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 }, statusAction: { backgroundColor: colors.primary, borderRadius: 12, marginLeft: 2, paddingHorizontal: 11, paddingVertical: 8 }, statusActionText: { color: "#081000", fontSize: 12, fontWeight: "800" }, sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }, sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" }, sectionCount: { color: colors.muted, fontSize: 12 }, listContent: { gap: 10, paddingBottom: 100 }, emptyContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 110 }, conversationCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, padding: 13 }, conversationGlyph: { alignItems: "center", backgroundColor: "#21331C", borderRadius: 14, height: 44, justifyContent: "center", width: 44 }, conversationGlyphText: { color: colors.lime, fontSize: 19 }, conversationTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 4 }, conversationPreview: { color: colors.muted, fontSize: 12 }, conversationMeta: { alignItems: "flex-end", gap: 3 }, dateText: { color: colors.muted, fontSize: 10 }, deleteButton: { alignItems: "center", height: 23, justifyContent: "center", width: 23 }, deleteButtonText: { color: colors.muted, fontSize: 22, lineHeight: 22 }, emptyState: { alignItems: "center", paddingHorizontal: 26 }, emptyOrbit: { alignItems: "center", backgroundColor: "#1C2A17", borderColor: "#416F31", borderRadius: 46, borderWidth: 1, height: 92, justifyContent: "center", marginBottom: 18, width: 92 }, emptyOrbitText: { color: colors.lime, fontSize: 37 }, emptyTitle: { color: colors.text, fontSize: 21, fontWeight: "800", marginBottom: 9 }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }, primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 17, justifyContent: "center", marginBottom: Platform.OS === "web" ? 8 : 3, minHeight: 56 }, primaryButtonText: { color: "#081000", fontSize: 16, fontWeight: "900" }, backButton: { alignItems: "center", backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 46, justifyContent: "center", width: 46 }, backText: { color: colors.text, fontSize: 34, fontWeight: "300", marginTop: -5 }, conversationHeading: { color: colors.text, fontSize: 18, fontWeight: "800" }, conversationSubheading: { color: colors.muted, fontSize: 11, marginTop: 3 }, inlineSetup: { backgroundColor: "#21281A", borderColor: "#59632D", borderRadius: 13, borderWidth: 1, marginBottom: 12, padding: 11 }, inlineSetupText: { color: colors.lime, fontSize: 12, fontWeight: "800", textAlign: "center" }, messageList: { flex: 1 }, messageListContent: { gap: 15, paddingBottom: 16 }, messageEmpty: { flexGrow: 1, justifyContent: "center", paddingBottom: 55 }, messageWrap: { maxWidth: "91%" }, messageWrapUser: { alignSelf: "flex-end" }, messageWrapAssistant: { alignSelf: "flex-start" }, messageBubble: { borderRadius: 19, paddingHorizontal: 14, paddingVertical: 12 }, userBubble: { backgroundColor: "#3C681B", borderBottomRightRadius: 5 }, assistantBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 5, borderColor: colors.border, borderWidth: 1 }, messageText: { fontSize: 14, lineHeight: 21 }, userText: { color: "#FFFFFF" }, assistantText: { color: colors.text }, messageActions: { flexDirection: "row", gap: 13, marginHorizontal: 4, marginTop: 5 }, messageActionText: { color: colors.muted, fontSize: 11, fontWeight: "700" }, typingRow: { flexDirection: "row", gap: 5, minHeight: 20, paddingTop: 3 }, typingDot: { backgroundColor: colors.lime, borderRadius: 3, height: 6, width: 6 }, sentAttachments: { borderTopColor: "rgba(255,255,255,0.2)", borderTopWidth: 1, gap: 3, marginTop: 9, paddingTop: 8 }, sentAttachmentText: { color: "#E5F6D2", fontSize: 11 }, attachmentStrip: { gap: 6, marginBottom: 8 }, attachmentChip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#21331C", borderColor: "#416F31", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 7 }, attachmentLabel: { color: colors.lime, fontSize: 11, maxWidth: 250 }, attachmentRemove: { color: colors.text, fontSize: 18, lineHeight: 16 }, composer: { alignItems: "flex-end", backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 7, marginBottom: 3, padding: 7 }, attachButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, height: 38, justifyContent: "center", width: 38 }, attachButtonText: { color: colors.lime, fontSize: 23, lineHeight: 25 }, composerInput: { color: colors.text, flex: 1, fontSize: 14, maxHeight: 110, minHeight: 40, paddingHorizontal: 5, paddingTop: 10 }, sendButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, height: 38, justifyContent: "center", width: 38 }, stopButton: { backgroundColor: colors.danger }, sendButtonText: { color: "#081000", fontSize: 21, fontWeight: "900", lineHeight: 22 }, settingsContent: { paddingBottom: 21 }, fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "800", marginBottom: 8, marginTop: 18 }, input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 52, paddingHorizontal: 14 }, helperText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, keyRow: { flexDirection: "row", gap: 8 }, keyInput: { flex: 1 }, revealButton: { alignItems: "center", backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 14, borderWidth: 1, justifyContent: "center", paddingHorizontal: 13 }, revealButtonText: { color: colors.lime, fontSize: 12, fontWeight: "800" }, fieldHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, testedAt: { color: colors.muted, fontSize: 11, marginTop: 18 }, modelList: { marginTop: 13 }, discoveredLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 }, modelChip: { backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginBottom: 7, paddingHorizontal: 12, paddingVertical: 10 }, modelChipSelected: { backgroundColor: "#263D1E", borderColor: colors.primary }, modelChipText: { color: colors.muted, fontSize: 12 }, modelChipTextSelected: { color: colors.lime, fontWeight: "800" }, testButton: { alignItems: "center", backgroundColor: "#2F4031", borderRadius: 15, justifyContent: "center", marginTop: 22, minHeight: 52 }, testButtonText: { color: colors.text, fontSize: 15, fontWeight: "800" }, buttonDisabled: { opacity: 0.65 }, resultCard: { borderRadius: 15, marginTop: 12, padding: 13 }, resultSuccess: { backgroundColor: "#173016", borderColor: "#3E7537", borderWidth: 1 }, resultError: { backgroundColor: "#351C19", borderColor: "#9B453B", borderWidth: 1 }, resultHeading: { fontSize: 13, fontWeight: "800", marginBottom: 4 }, resultHeadingSuccess: { color: colors.lime }, resultHeadingError: { color: "#FF9A8F" }, resultMessage: { color: colors.text, fontSize: 12, lineHeight: 18 }, privacyCard: { backgroundColor: "#101C17", borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 23, padding: 15 }, privacyTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6 }, privacyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});

const bubbleStyles = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 19, borderWidth: 1, flexDirection: "row", gap: 11, marginBottom: 23, padding: 14 },
  badge: { alignItems: "center", backgroundColor: colors.primary, borderColor: colors.lime, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  badgeText: { color: "#081000", fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 3 },
  detail: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  toggle: { backgroundColor: "#3A4840", borderRadius: 18, height: 29, justifyContent: "center", paddingHorizontal: 3, width: 52 },
  toggleOn: { backgroundColor: colors.primary },
  knob: { backgroundColor: colors.text, borderRadius: 12, height: 23, width: 23 },
  knobOn: { alignSelf: "flex-end" },
});

const appearanceStyles = StyleSheet.create({
  panel: { backgroundColor: "#101C17", borderColor: colors.border, borderRadius: 19, borderWidth: 1, marginBottom: 23, padding: 14 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 14 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 3 },
  detail: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  preview: { alignItems: "center", borderColor: colors.text, borderRadius: 30, borderWidth: 1.5, justifyContent: "center", maxHeight: 45, maxWidth: 45, minHeight: 27, minWidth: 27 },
  previewText: { color: "#081000", fontSize: 10, fontWeight: "900" },
  label: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginBottom: 8, marginTop: 5 },
  sizeRow: { flexDirection: "row", gap: 7, marginBottom: 11 },
  sizePill: { alignItems: "center", backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: 6 },
  sizePillSelected: { backgroundColor: "#263D1E", borderColor: colors.primary },
  sizeText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  sizeTextSelected: { color: colors.lime },
  colorRow: { flexDirection: "row", gap: 11 },
  colorButton: { alignItems: "center", borderColor: "transparent", borderRadius: 18, borderWidth: 2, height: 34, justifyContent: "center", width: 34 },
  colorButtonSelected: { borderColor: colors.text },
  colorSwatch: { borderRadius: 12, height: 22, width: 22 },
});
