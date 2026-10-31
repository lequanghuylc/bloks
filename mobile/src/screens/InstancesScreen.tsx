import { useCallback, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { transportOf } from "../lib/address.ts";
import { Unpaired } from "../lib/client.ts";
import { useInstances, type Instance } from "../lib/instances";
import type { Bot } from "../lib/messages.ts";
import type { ScreenProps } from "../lib/routes";
import { useColors } from "../lib/theme";

type Status = { state: "checking" | "online" | "offline" | "unpaired"; unread?: number };

const TRANSPORT = { tailscale: "Tailscale", lan: "Local network", https: "HTTPS", http: "HTTP" };

export function InstancesScreen({ navigation }: ScreenProps<"Instances">) {
  const colors = useColors();
  const { ready, instances, clientFor, remove } = useInstances();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => navigation.navigate("AddInstance")}>
          <Text style={{ color: colors.accent, fontSize: 17 }}>Add</Text>
        </Pressable>
      ),
    });
  }, [navigation, colors.accent]);

  const check = useCallback(async () => {
    await Promise.all(instances.map(async (item) => {
      const client = clientFor(item.id);
      if (!client) return;
      let status: Status;
      try {
        const body = await client.request<{ bots: Bot[] }>("/api/bots?messages=0", { timeoutMs: 6000 });
        status = { state: "online", unread: (body.bots ?? []).filter((bot) => !bot.hidden && !bot.archivedAt && bot.unread).length };
      } catch (err) {
        status = { state: err instanceof Unpaired ? "unpaired" : "offline" };
      }
      setStatuses((current) => ({ ...current, [item.id]: status }));
    }));
  }, [instances, clientFor]);

  useFocusEffect(useCallback(() => {
    void check();
    const timer = setInterval(() => void check(), 20000);
    return () => clearInterval(timer);
  }, [check]));

  const refresh = async () => {
    setRefreshing(true);
    await check();
    setRefreshing(false);
  };

  const open = (item: Instance) => {
    if (statuses[item.id]?.state === "unpaired") navigation.navigate("AddInstance", { instanceId: item.id });
    else navigation.navigate("Conversations", { instanceId: item.id });
  };

  const confirmRemove = (item: Instance) => {
    Alert.alert(`Remove ${item.name}?`, "This phone forgets it. To remove the pairing as well, use Phone and devices on that computer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove(item.id) },
    ]);
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={instances.length ? undefined : styles.emptyWrap}
      data={instances}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListEmptyComponent={ready ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No instances yet</Text>
          <Text style={[styles.emptyBody, { color: colors.muted }]}>Add each computer running Bloks by its local network or Tailscale address.</Text>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate("AddInstance")} style={[styles.primary, { backgroundColor: colors.accent }]}>
            <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: "600" }}>Add an instance</Text>
          </Pressable>
        </View>
      ) : null}
      renderItem={({ item }) => {
        const status = statuses[item.id] ?? { state: "checking" };
        const dot = status.state === "online" ? colors.success : status.state === "unpaired" ? colors.warning : status.state === "offline" ? colors.danger : colors.muted;
        const label = status.state === "online"
          ? (status.unread ? `${status.unread} unread` : "Online")
          : status.state === "unpaired" ? "Pair again" : status.state === "offline" ? "Not reachable" : "Checking";
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(item)}
            onLongPress={() => confirmRemove(item)}
            style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surface : colors.background }]}
          >
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <View style={styles.rowBody}>
              <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>
                {item.origin.replace(/^https?:\/\//, "")} · {TRANSPORT[transportOf(item.origin)]}
              </Text>
            </View>
            <Text style={{ color: status.unread ? colors.accent : colors.muted, fontSize: 13 }}>{label}</Text>
          </Pressable>
        );
      }}
      ListFooterComponent={instances.length ? <Text style={[styles.hint, { color: colors.muted }]}>Touch and hold an instance to remove it.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "600" },
  emptyBody: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  primary: { marginTop: 10, minHeight: 48, paddingHorizontal: 22, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: "500" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hint: { fontSize: 13, textAlign: "center", padding: 16 },
});
