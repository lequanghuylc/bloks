import { useCallback, useLayoutEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChatPane } from "../components/ChatPane";
import { ConversationList, type Selected } from "../components/ConversationList";
import { useInstances } from "../lib/instances";
import { useIsWide } from "../lib/layout";
import type { ScreenProps } from "../lib/routes";
import { useColors } from "../lib/theme";
import { usePublishWorkspace } from "../lib/workspaceContext";

export function ConversationsScreen({ navigation, route }: ScreenProps<"Conversations">) {
  const { instanceId } = route.params;
  const colors = useColors();
  const wide = useIsWide();
  const { instances } = useInstances();
  const instance = instances.find((item) => item.id === instanceId);
  const workspace = usePublishWorkspace(instanceId);
  const [selected, setSelected] = useState<Selected | null>(route.params.open ?? null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: instance?.name ?? "Bloks",
      headerRight: () => (
        <View style={styles.actions}>
          {instance?.access === "open" && (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => navigation.navigate("Web", { instanceId })}>
              <Text style={{ color: colors.accent, fontSize: 17 }}>Full app</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => navigation.navigate("Settings", { instanceId })}>
            <Text style={{ color: colors.accent, fontSize: 17 }}>Settings</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, instance, instanceId, colors.accent]);

  useLayoutEffect(() => {
    if (workspace.unpaired) navigation.replace("AddInstance", { instanceId });
  }, [workspace.unpaired, navigation, instanceId]);

  const onUnpaired = useCallback(() => navigation.popTo("Instances"), [navigation]);

  const open = (item: Selected) => {
    if (wide) setSelected(item);
    else navigation.navigate("Chat", { instanceId, ...item });
  };

  if (!wide) return <ConversationList workspace={workspace} onOpen={open} />;

  return (
    <View style={[styles.split, { backgroundColor: colors.background }]}>
      <View style={[styles.side, { borderRightColor: colors.border }]}>
        <ConversationList workspace={workspace} selected={selected} onOpen={open} />
      </View>
      <View style={styles.main}>
        {selected ? (
          <ChatPane key={`${selected.kind}:${selected.id}`} instanceId={instanceId} kind={selected.kind} id={selected.id} name={selected.name} onUnpaired={onUnpaired} />
        ) : (
          <View style={styles.none}>
            <Text style={{ color: colors.muted, fontSize: 16 }}>Choose a conversation</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: 18 },
  split: { flex: 1, flexDirection: "row" },
  side: { width: 340, borderRightWidth: StyleSheet.hairlineWidth },
  main: { flex: 1 },
  none: { flex: 1, alignItems: "center", justifyContent: "center" },
});
