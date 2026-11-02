// What is waiting to be said, above the message box
// (src/components/WaitingStrip.tsx). Your own can be reworded, sent now or
// taken back; what another agent or a person queued is shown with who sent it.
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { Client } from "../lib/client.ts";
import { waitingSender, waitingStatus, waitingTitle } from "../lib/chatMeta.ts";
import type { Message } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { Icon } from "./Icon";

function Pulse({ color }: { color: string }) {
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(fade, { toValue: 0.25, duration: 800, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [fade]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: fade }]} />;
}

function WaitingRow({ message, threadId, client, working, onSendAgain }: { message: Message; threadId: string; client: Client | null; working: boolean; onSendAgain?: (message: Message) => void }) {
  const colors = useColors();
  const sender = waitingSender(message);
  const yours = sender === null;
  const [editing, setEditing] = useState<string | null>(null);
  const path = `/api/threads/${threadId}/messages/${message.id}`;
  // The server holds back the turn it waits for while the editor is open.
  const opened = useRef<Promise<unknown> | null>(null);
  const hold = (on: boolean) => client?.request(`${path}/editing`, { method: "POST", body: { editing: on } }) ?? Promise.resolve();

  const start = () => {
    setEditing(message.text ?? "");
    opened.current = hold(true).catch(() => {});
  };
  const stop = (text?: string) => {
    setEditing(null);
    const open = opened.current;
    opened.current = null;
    void open?.then(() => (text ? client?.request(path, { method: "PATCH", body: { text } }).catch(() => hold(false)) : hold(false))).catch(() => {});
  };
  // a row that goes mid-edit lets go of what it held
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => {
    if (opened.current) stopRef.current();
  }, []);

  const takeBack = () => {
    Alert.alert("Take this message back?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: message.unsent ? "Delete" : "Take back", style: "destructive", onPress: () => void client?.request(path, { method: "DELETE" }).catch((err) => Alert.alert("Not taken back", err instanceof Error ? err.message : String(err))) },
    ]);
  };

  return (
    <View style={[styles.row, { backgroundColor: message.unsent ? `${colors.warning}14` : colors.secondary }]}>
      <View style={styles.rowBody}>
        {!!sender && <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "500" }}>From {sender}</Text>}
        {editing !== null ? (
          <View style={styles.editor}>
            <TextInput
              autoFocus
              multiline
              value={editing}
              onChangeText={setEditing}
              accessibilityLabel="Edit the waiting message"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <View style={styles.editorActions}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => stop(editing.trim() || undefined)}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", textDecorationLine: "underline" }}>Save</Text>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => stop()}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text numberOfLines={3} style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{message.text}</Text>
        )}
        <View accessibilityRole="text" style={styles.status}>
          {!message.unsent && <Pulse color={colors.muted} />}
          <Text style={{ color: message.unsent ? colors.warning : colors.muted, fontSize: 12, lineHeight: 16, fontWeight: "500", flexShrink: 1 }}>{waitingStatus(message, working, editing !== null)}</Text>
        </View>
      </View>
      {editing === null && (
        <View style={styles.rowActions}>
          {message.unsent && yours && onSendAgain && !!message.text && (
            <Pressable accessibilityRole="button" onPress={() => onSendAgain(message)} style={styles.again}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>Send again</Text>
            </Pressable>
          )}
          {yours && message.queued && !!message.text && (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={4} onPress={start} style={styles.iconButton}>
              <Icon name="edit" size={15} color={colors.muted} />
            </Pressable>
          )}
          {(yours || message.unsent) && (
            <Pressable accessibilityRole="button" accessibilityLabel={message.unsent ? "Delete" : "Take back"} hitSlop={4} onPress={takeBack} style={styles.iconButton}>
              <Icon name="delete" size={15} color={colors.muted} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function WaitingCard({ waiting, threadId, client, working, onSendNow, onSendAgain, style }: {
  waiting: Message[];
  threadId: string;
  client: Client | null;
  working: boolean;
  onSendNow?: () => void;
  onSendAgain?: (message: Message) => void;
  style?: object;
}) {
  const colors = useColors();
  if (!waiting.length) return null;
  const unsent = waiting.every((m) => m.unsent);
  const mineQueued = waiting.some((m) => m.queued && waitingSender(m) === null);
  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.head}>
          <Icon name="clock" size={16} color={unsent ? colors.warning : colors.muted} />
          <Text style={{ color: unsent ? colors.warning : colors.text, fontSize: 15, flex: 1 }}>{waitingTitle(waiting)}</Text>
          {mineQueued && working && onSendNow && (
            <Pressable accessibilityRole="button" onPress={onSendNow} style={[styles.sendNow, { backgroundColor: colors.secondary }]}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>Send now</Text>
            </Pressable>
          )}
        </View>
        <ScrollView style={styles.list} contentContainerStyle={styles.listBody} keyboardShouldPersistTaps="handled" accessibilityLabel="Waiting to send">
          {waiting.map((message) => <WaitingRow key={message.id} message={message} threadId={threadId} client={client} working={working} onSendAgain={onSendAgain} />)}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 10, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, minHeight: 28 },
  sendNow: { minHeight: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: "center" },
  list: { maxHeight: 190 },
  listBody: { gap: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 12, paddingVertical: 8, paddingLeft: 12, paddingRight: 4 },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowActions: { flexDirection: "row", alignItems: "center" },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  again: { minHeight: 34, paddingHorizontal: 8, justifyContent: "center" },
  status: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  editor: { gap: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 16, maxHeight: 120 },
  editorActions: { flexDirection: "row", gap: 16 },
});
