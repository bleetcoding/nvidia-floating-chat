import { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const colors = {
  backdrop: "rgba(0, 0, 0, 0.62)",
  surface: "#121A16",
  elevated: "#18221C",
  primary: "#76B900",
  text: "#F2F7F1",
  muted: "#9AA89B",
  border: "#2C3A30",
};

export function NewChatSetup({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (instruction: string) => void }) {
  const [instruction, setInstruction] = useState("");
  const finish = () => {
    onCreate(instruction.trim());
    setInstruction("");
  };
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>NEW CONVERSATION</Text>
          <Text style={styles.title}>Add an instruction?</Text>
          <Text style={styles.description}>Optional. Leave this blank for a normal chat, or guide this conversation with an instruction such as “act as a concise writing coach.”</Text>
          <TextInput
            accessibilityLabel="Optional conversation instruction"
            multiline
            value={instruction}
            onChangeText={setInstruction}
            placeholder="No instruction by default"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <View style={styles.actions}>
            <TouchableOpacity accessibilityLabel="Cancel new chat" onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Start conversation" onPress={finish} style={styles.startButton}><Text style={styles.startText}>Start chat</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.backdrop, flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 22 },
  handle: { alignSelf: "center", backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: 22, width: 44 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 17 },
  input: { backgroundColor: colors.elevated, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.text, fontSize: 14, lineHeight: 20, minHeight: 110, padding: 14, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 10, marginTop: 17 },
  cancelButton: { alignItems: "center", borderColor: colors.border, borderRadius: 15, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 52 },
  cancelText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  startButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 15, flex: 1, justifyContent: "center", minHeight: 52 },
  startText: { color: "#081000", fontSize: 14, fontWeight: "900" },
});
