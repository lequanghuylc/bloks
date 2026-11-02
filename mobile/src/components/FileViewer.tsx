// A file opened from the chat, over everything (src/components/Artifacts.tsx).
// A picture is drawn here and pinches to zoom; the rest goes to a web view,
// which on iOS reads PDFs, text, pages, video and office files.
import { useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { baseName } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { Icon } from "./Icon";

export type OpenFile = {
  name: string;
  source: { uri: string; headers?: Record<string, string> };
  picture: boolean;
};

export function FileViewer({ file, onClose }: { file: OpenFile | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file]);
  return (
    <Modal visible={!!file} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {file && (
        <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.head, { borderBottomColor: colors.border }]}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "600", flex: 1 }}>{baseName(file.name)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={styles.close}>
              <Icon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          {failed ? (
            <Text style={[styles.failed, { color: colors.muted }]}>This file could not be opened. It may have been moved or removed.</Text>
          ) : file.picture ? (
            <ScrollView style={styles.body} contentContainerStyle={styles.body} maximumZoomScale={5} minimumZoomScale={1} centerContent>
              <Image accessibilityLabel={baseName(file.name)} source={file.source} resizeMode="contain" onError={() => setFailed(true)} style={styles.body} />
            </ScrollView>
          ) : (
            <WebView source={file.source} allowsInlineMediaPlayback onError={() => setFailed(true)} onHttpError={() => setFailed(true)} style={[styles.body, { backgroundColor: colors.background }]} />
          )}
        </View>
      )}
    </Modal>
  );
}

/** The photo about to be sent, in the message box. */
export function PickedPhoto({ uri, sending, onOpen, onRemove }: { uri: string; sending: boolean; onOpen: () => void; onRemove: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.picked, sending && styles.pickedSending]}>
      <Pressable accessibilityRole="button" accessibilityLabel="View the attached photo" onPress={onOpen}>
        <Image source={{ uri }} resizeMode="cover" style={[styles.pickedImage, { backgroundColor: colors.secondary }]} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove the attached photo" hitSlop={8} disabled={sending} onPress={onRemove} style={[styles.pickedRemove, { backgroundColor: colors.secondary, borderColor: colors.card }]}>
        <Icon name="close" size={13} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 16, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, width: "100%" },
  picked: { alignSelf: "flex-start", marginTop: 6, marginLeft: 8, marginBottom: 2 },
  pickedSending: { opacity: 0.5 },
  pickedImage: { width: 72, height: 72, borderRadius: 12 },
  pickedRemove: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  failed: { padding: 24, fontSize: 15, lineHeight: 21, textAlign: "center" },
});
