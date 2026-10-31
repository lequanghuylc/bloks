import { useMemo } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";

import { previewOf, type Bot, type Message, type Room } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import type { useWorkspace } from "../lib/useWorkspace";
import { Avatar } from "./Avatar";

export type Selected = { kind: "bot" | "room"; id: string; name: string };
type Item = { kind: "bot"; bot: Bot } | { kind: "room"; room: Room };

function whenOf(messages: Message[] | undefined, now: Date): string {
  const at = messages?.[messages.length - 1]?.at;
  if (!at) return "";
  const date = new Date(at);
  if (date.toDateString() === now.toDateString()) return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function ConversationList({ workspace, selected, onOpen }: { workspace: ReturnType<typeof useWorkspace>; selected?: Selected | null; onOpen: (item: Selected) => void }) {
  const colors = useColors();
  const sections = useMemo(() => {
    const rooms = workspace.rooms.filter((room) => !room.archived).map((room): Item => ({ kind: "room", room }));
    const bots = workspace.bots.filter((bot) => !bot.hidden && !bot.archivedAt).map((bot): Item => ({ kind: "bot", bot }));
    return [
      ...(rooms.length ? [{ title: "Rooms", data: rooms }] : []),
      ...(bots.length ? [{ title: "Agents", data: bots }] : []),
    ];
  }, [workspace.bots, workspace.rooms]);
  const now = new Date();

  return (
    <SectionList
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      stickySectionHeadersEnabled={false}
      keyExtractor={(item) => (item.kind === "bot" ? item.bot.id : item.room.id)}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void workspace.reload()} />}
      ListHeaderComponent={!workspace.connected && workspace.loaded ? (
        <Text style={[styles.banner, { color: colors.warning }]}>{workspace.error || "Reconnecting…"}</Text>
      ) : null}
      ListEmptyComponent={workspace.loaded && !workspace.error ? <Text style={[styles.empty, { color: colors.muted }]}>No conversations yet.</Text> : null}
      renderSectionHeader={({ section }) => <Text style={[styles.section, { color: colors.muted }]}>{section.title}</Text>}
      renderItem={({ item }) => {
        const entry = item.kind === "bot" ? item.bot : item.room;
        const bot = item.kind === "bot" ? item.bot : null;
        const needsYou = bot?.tasks?.some((task) => task.state === "needs-you");
        const working = bot?.busy || bot?.tasks?.some((task) => task.state === "working");
        const name = entry.name || "Untitled";
        const on = selected?.kind === item.kind && selected.id === entry.id;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onOpen({ kind: item.kind, id: entry.id, name })}
            style={({ pressed }) => [styles.row, { backgroundColor: on || pressed ? colors.surface : "transparent" }]}
          >
            <Avatar name={name} color={bot?.color} />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text, fontWeight: bot?.unread ? "700" : "500" }]}>{name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{whenOf(entry.messages, now)}</Text>
              </View>
              <View style={styles.rowTop}>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{previewOf(entry.messages) || " "}</Text>
                {needsYou
                  ? <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "600" }}>Needs you</Text>
                  : working
                    ? <Text style={{ color: colors.muted, fontSize: 12 }}>Working</Text>
                    : bot?.unread
                      ? <View style={[styles.unread, { backgroundColor: colors.accent }]} accessibilityLabel="Unread" />
                      : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  banner: { fontSize: 13, textAlign: "center", padding: 8 },
  empty: { fontSize: 15, textAlign: "center", padding: 32 },
  section: { fontSize: 13, fontWeight: "600", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 8, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 16, flex: 1 },
  unread: { width: 10, height: 10, borderRadius: 5 },
});
