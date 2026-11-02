// The conversation verbs (src/components/MessageActions.tsx): reply, forward,
// copy, react and the rest. Nothing hovers on a phone, so each message carries
// when it was said and a ⋯ that opens them.
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Clipboard, LogBox, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { actionsFor, excerptOf, QUICK_REACTIONS, redoLine, stamp, type ActionKey, type RedoPreview, type ReplyDraft } from "../lib/chatMeta.ts";
import type { Client } from "../lib/client.ts";
import type { Bot, Message, Room } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

// The core module still ships with React Native and needs no new native build.
LogBox.ignoreLogs(["Clipboard has been extracted"]);

export function Reactions({ reactions, onToggle }: { reactions?: Record<string, string[]>; onToggle: (emoji: string) => void }) {
  const colors = useColors();
  const entries = Object.entries(reactions ?? {}).filter(([, who]) => who.length > 0);
  if (!entries.length) return null;
  return (
    <View style={styles.reactions}>
      {entries.map(([emoji, who]) => {
        const mine = who.includes("user");
        return (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            onPress={() => onToggle(emoji)}
            style={[styles.reaction, { borderColor: mine ? colors.accent : colors.border, backgroundColor: mine ? `${colors.accent}22` : colors.secondary }]}
          >
            <Text style={{ fontSize: 13 }}>{emoji}</Text>
            {who.length > 1 && <Text style={{ color: colors.muted, fontSize: 12 }}>{who.length}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** What a bubble shows when its message answered an earlier one. */
export function ReplyContext({ replyTo }: { replyTo: NonNullable<Message["replyTo"]> }) {
  const colors = useColors();
  return (
    <View style={[styles.replyContext, { borderLeftColor: colors.accent, backgroundColor: colors.surface }]}>
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "500" }}>{replyTo.author}</Text>
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{replyTo.excerpt}</Text>
    </View>
  );
}

/** The chip above the message box while a reply is being written. */
export function ReplyChip({ draft, onClear, style }: { draft: ReplyDraft; onClear: () => void; style?: object }) {
  const colors = useColors();
  return (
    <View style={[styles.replyChipWrap, style]}>
      <View style={[styles.replyChip, { borderColor: `${colors.accent}55`, backgroundColor: `${colors.accent}18` }]}>
        <Icon name="reply" size={14} color={colors.ink} />
        <View style={styles.replyChipBody}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontWeight: "500" }}>Replying to {draft.author}</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{draft.excerpt}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={10} onPress={onClear}>
          <Icon name="close" size={15} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/** When it was said and the way to the verbs, under a message. */
export function MessageMeta({ message, room, align, onOpen }: { message: Message; room: boolean; align: "start" | "end"; onOpen: () => void }) {
  const colors = useColors();
  const when = stamp(message.at);
  const opens = actionsFor(message, room).length > 0;
  if (!when && !opens) return null;
  return (
    <View style={[styles.meta, align === "end" && styles.metaEnd]}>
      {!!when && <Text style={{ color: colors.muted, fontSize: 12 }}>{when}</Text>}
      {!!message.editedAt && <Text style={{ color: colors.muted, fontSize: 12 }}>edited</Text>}
      {opens && (
        <Pressable accessibilityRole="button" accessibilityLabel="Message actions" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={onOpen} style={styles.more}>
          <Icon name="more" size={16} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const WORDS: Record<ActionKey, { label: string; icon: IconName }> = {
  copy: { label: "Copy", icon: "copy" },
  reply: { label: "Reply", icon: "reply" },
  forward: { label: "Forward", icon: "forward" },
  edit: { label: "Edit", icon: "edit" },
  rewind: { label: "Rewind to here", icon: "rewind" },
  delete: { label: "Delete", icon: "delete" },
};

/** The six reactions and the verbs, rising from the bottom of the screen. */
export function ActionSheet({ message, author, room, onClose, onReact, onAction }: {
  message: Message | null;
  author: string;
  room: boolean;
  onClose: () => void;
  onReact: (message: Message, emoji: string) => void;
  onAction: (key: ActionKey, message: Message) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [message]);
  if (!message) return null;
  const copy = () => {
    Clipboard.setString(message.text ?? "");
    setCopied(true);
    setTimeout(onClose, 500);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View pointerEvents="box-none" style={styles.sheetPlace}>
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text numberOfLines={2} style={[styles.preview, { color: colors.muted }]}>
          <Text style={{ color: colors.text, fontWeight: "500" }}>{author}: </Text>{excerptOf(message)}
        </Text>
        <View style={styles.emoji}>
          {QUICK_REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
              onPress={() => {
                onReact(message, emoji);
                onClose();
              }}
              style={({ pressed }) => [styles.emojiButton, { backgroundColor: pressed || message.reactions?.[emoji]?.includes("user") ? colors.surface : colors.secondary }]}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        {actionsFor(message, room).map((key) => {
          const danger = key === "delete";
          const done = key === "copy" && copied;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => (key === "copy" ? copy() : onAction(key, message))}
              style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surface : "transparent" }]}
            >
              <Icon name={done ? "check" : WORDS[key].icon} size={18} color={done ? colors.success : danger ? colors.danger : colors.text} />
              <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 16 }}>{done ? "Copied" : WORDS[key].label}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>
    </Modal>
  );
}

/** Pick where a forwarded message goes. It sends on the pick, with who said it named. */
export function ForwardSheet({ target, bots, rooms, onClose, onSend }: {
  target: { message: Message; author: string } | null;
  bots: Bot[];
  rooms: Room[];
  onClose: () => void;
  onSend: (to: { kind: "bot" | "room"; id: string }, text: string) => Promise<unknown>;
}) {
  const colors = useColors();
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => setSent(null), [target]);
  if (!target) return null;
  const body = `(Forwarded from ${target.author})\n> ${(target.message.text ?? "").trim().split("\n").join("\n> ")}`;
  const go = (kind: "bot" | "room", id: string) => {
    if (sent) return;
    setSent(id);
    onSend({ kind, id }, body).then(() => setTimeout(onClose, 350), (err) => {
      setSent(null);
      Alert.alert("Not sent", err instanceof Error ? err.message : String(err));
    });
  };
  const row = (kind: "bot" | "room", id: string, name: string, color?: string) => (
    <Pressable key={id} accessibilityRole="button" onPress={() => go(kind, id)} style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.surface : "transparent" }]}>
      <Avatar name={name} color={color} size={28} />
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, flex: 1 }}>{name}</Text>
      {sent === id && <Text style={{ color: colors.success, fontSize: 13 }}>Sent</Text>}
    </Pressable>
  );
  return (
    <Sheet visible title="Forward to" onClose={onClose}>
      <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 14 }}>
        <Text style={{ color: colors.text, fontWeight: "500" }}>{target.author}: </Text>{excerptOf(target.message)}
      </Text>
      <View>
        {rooms.filter((room) => !room.archived).map((room) => row("room", room.id, room.name))}
        {bots.filter((bot) => !bot.hidden && !bot.archivedAt).map((bot) => row("bot", bot.id, bot.name, bot.color))}
      </View>
    </Sheet>
  );
}

/** Your own sent words. Once the agent has read them, Redo is what changes the
 * conversation; saving only rewrites the record. The server says which. */
export function EditSheet({ message, threadId, client, agent, onClose, onRedone }: {
  message: Message | null;
  threadId: string;
  client: Client | null;
  agent: string;
  onClose: () => void;
  onRedone: (result: { sent?: boolean; text?: string; error?: string }, text: string) => void;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState("");
  const [redo, setRedo] = useState<RedoPreview | null>(null);
  const [asking, setAsking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const path = message ? `/api/threads/${threadId}/messages/${message.id}` : "";
  useEffect(() => {
    if (!message || !client) return;
    let live = true;
    setDraft(message.text ?? "");
    setRedo(null);
    setProblem("");
    setBusy(false);
    setAsking(true);
    client.request<RedoPreview>(`${path}/redo`).then((preview) => {
      if (live) setRedo(preview);
    }).catch(() => {}).finally(() => {
      if (live) setAsking(false);
    });
    return () => {
      live = false;
    };
  }, [message, client, path]);
  if (!message) return null;
  const words = draft.trim();
  const save = () => {
    if (!words || busy) return;
    setBusy(true);
    client?.request(path, { method: "PATCH", body: { text: words } }).then(onClose, (err) => {
      setBusy(false);
      setProblem(err instanceof Error ? err.message : String(err));
    });
  };
  const redoNow = () => {
    if (!words || busy) return;
    setBusy(true);
    setProblem("");
    client?.request<{ sent?: boolean; text?: string; error?: string }>(`${path}/redo`, { method: "POST", body: { text: words } }).then((result) => onRedone(result, words), (err) => {
      setBusy(false);
      setProblem(err instanceof Error ? err.message : String(err));
    });
  };
  const offer = redo?.offered ? redo : null;
  return (
    <Sheet visible title="Edit message" onClose={onClose}>
      <TextInput autoFocus multiline value={draft} onChangeText={setDraft} accessibilityLabel="Your message" style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} />
      {!!offer && <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{redoLine(offer, agent)}</Text>}
      {!!problem && <Text style={{ color: colors.danger, fontSize: 14 }}>{problem}</Text>}
      {asking || busy ? <ActivityIndicator /> : (
        <View style={styles.editButtons}>
          {offer && (
            <Pressable accessibilityRole="button" disabled={!words} onPress={redoNow} style={[styles.editButton, { backgroundColor: colors.accent }]}>
              <Text style={{ color: colors.onAccent, fontSize: 15, fontWeight: "600" }}>Redo</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" disabled={!words} onPress={save} style={[styles.editButton, offer ? { backgroundColor: colors.secondary } : { backgroundColor: colors.accent }]}>
            <Text style={{ color: offer ? colors.text : colors.onAccent, fontSize: 15, fontWeight: "600" }}>{offer ? "Save only" : "Save"}</Text>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 26, paddingHorizontal: 8, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth },
  replyContext: { borderLeftWidth: 2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  replyChipWrap: { paddingHorizontal: 12, paddingBottom: 6 },
  replyChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  replyChipBody: { flex: 1, minWidth: 0 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 },
  metaEnd: { justifyContent: "flex-end" },
  more: { paddingHorizontal: 4, minHeight: 22, justifyContent: "center" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheetPlace: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  sheet: { width: "100%", maxWidth: 520, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 14 },
  preview: { fontSize: 14, lineHeight: 19, paddingHorizontal: 10, paddingBottom: 12 },
  emoji: { flexDirection: "row", justifyContent: "space-between", gap: 6, paddingHorizontal: 8, paddingBottom: 8 },
  emojiButton: { flex: 1, height: 46, maxWidth: 56, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  action: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 48, paddingHorizontal: 12, borderRadius: 12 },
  editInput: { minHeight: 120, maxHeight: 260, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: "top" },
  editButtons: { flexDirection: "row", gap: 10 },
  editButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
