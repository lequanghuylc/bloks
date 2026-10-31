import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "../lib/theme";

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={[styles.head, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.done}>
          <Text style={{ color: colors.accent, fontSize: 17, fontWeight: "600" }}>Done</Text>
        </Pressable>
      </View>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 56, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: "600", maxWidth: "70%" },
  done: { position: "absolute", right: 16, minHeight: 44, justifyContent: "center" },
  body: { padding: 16, gap: 16 },
});
