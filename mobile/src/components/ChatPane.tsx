import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { Avatar } from "./Avatar";
import { Markdown } from "./Markdown";
import { RowView, type RowContext } from "./MessageRow";
import { ModelSheet } from "./ModelSheet";
import { UsageSheet } from "./UsageSheet";
import { Unpaired } from "../lib/client.ts";
import { contextPercent, effortName, clampEffort, effortLevels, measuredContext, selectionLabel, type Engine } from "../lib/engines.ts";
import { useInstances } from "../lib/instances";
import { READING_WIDTH, useIsWide } from "../lib/layout";
import { cardAnswerRequest, composeOutgoing, isProgressText, upsert, type Lane, type Message, type OptionCard } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { rowsOf } from "../lib/turnFold.ts";
import { E2E, e2e } from "../lib/e2e";
import { useLiveWorkspace } from "../lib/workspaceContext";

type Picked = { uri: string; base64: string; mime: string };

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function ChatPane({ instanceId, kind, id, name, onUnpaired }: { instanceId: string; kind: "bot" | "room"; id: string; name: string; onUnpaired: () => void }) {
  const wide = useIsWide();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { clientFor } = useInstances();
  const client = useMemo(() => clientFor(instanceId), [clientFor, instanceId]);
  const workspace = useLiveWorkspace(instanceId);
  const bot = kind === "bot" ? workspace?.bots.find((item) => item.id === id) : undefined;
  const room = kind === "room" ? workspace?.rooms.find((item) => item.id === id) : undefined;

  // The lane on this screen is this phone's own: opening one here does not
  // move the desktop off whatever it has open.
  const [laneId, setLaneId] = useState<string | undefined>(undefined);
  const thread = kind === "room" ? id : laneId ?? bot?.activeTaskId ?? bot?.threadId;
  const lanes: Lane[] = bot?.tasks ?? [];

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [olderLeft, setOlderLeft] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [working, setWorking] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef(thread);
  threadRef.current = thread;

  const [engines, setEngines] = useState<Engine[]>([]);
  const [sheet, setSheet] = useState<"model" | "usage" | null>(null);

  // asked when the chat opens and again when the list opens, since an engine
  // can be signed in or updated on the computer at any time
  useEffect(() => {
    if (!client || kind !== "bot") return;
    let current = true;
    client.request<{ instances?: Engine[] }>("/api/instances").then((body) => {
      if (current) setEngines(body.instances ?? []);
    }).catch(() => {});
    return () => {
      current = false;
    };
  }, [client, kind, sheet]);

  const patchBot = (patch: Record<string, unknown>) => {
    client?.request(`/api/bots/${id}`, { method: "PATCH", body: patch }).then(() => workspace?.reload()).catch((err) => {
      Alert.alert("Not changed", err instanceof Error ? err.message : String(err));
    });
  };

  const speak = useCallback((err: unknown) => {
    if (err instanceof Unpaired) onUnpaired();
    else setError(err instanceof Error ? err.message : String(err));
  }, [onUnpaired]);

  const load = useCallback(async () => {
    if (!client || !thread) return;
    try {
      const path = kind === "room"
        ? `/api/bloks/${id}/messages`
        : `/api/bots/${id}/messages?thread=${encodeURIComponent(thread)}`;
      const page = await client.request<{ messages?: Message[]; olderMessages?: number }>(path);
      if (threadRef.current !== thread) return;
      setMessages(page.messages ?? []);
      setOlderLeft((page.olderMessages ?? 1) > 0);
      setError("");
    } catch (err) {
      speak(err);
    } finally {
      setLoading(false);
    }
  }, [client, kind, id, thread, speak]);

  useEffect(() => {
    setLoading(true);
    setStreaming("");
    void load();
    if (kind === "bot" && !E2E) void client?.request(`/api/bots/${id}`, { method: "PATCH", body: { unread: false } }).catch(() => {});
  }, [load, kind, id, client]);

  useEffect(() => {
    if (!workspace || !thread) return;
    return workspace.subscribe((frame) => {
      if (frame?.kind === "hello") {
        if (!frame.resumed) void load();
        return;
      }
      if ((frame?.kind === "message" || frame?.kind === "message.patch") && frame.threadId === thread && frame.message) {
        setMessages((list) => upsert(list, frame.message, frame.moved === true));
        if (frame.message.role !== "user" && frame.message.kind === "text") setStreaming("");
        return;
      }
      if (frame?.kind === "runtime" && frame.event?.threadId === thread) {
        const event = frame.event;
        if (event.type === "content.delta" && event.streamKind === "assistant_text" && !isProgressText(event.codexText)) {
          setStreaming((current) => current + (event.delta ?? ""));
        } else if (event.type === "turn.started") {
          setWorking(true);
          setStreaming("");
        } else if (event.type === "turn.completed") {
          setWorking(false);
          // the message takes the streamed text's place; one that never
          // comes should not leave it standing
          setTimeout(() => setStreaming(""), 4000);
        }
      }
    });
    // `workspace` is new on every update, and subscribing needs only its stable subscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.subscribe, thread, load]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!client || !oldest || !olderLeft || loadingOlder || !thread || oldest.pending) return;
    setLoadingOlder(true);
    try {
      const path = kind === "room"
        ? `/api/bloks/${id}/messages?before=${encodeURIComponent(oldest.id)}`
        : `/api/bots/${id}/messages?thread=${encodeURIComponent(thread)}&before=${encodeURIComponent(oldest.id)}`;
      const page = await client.request<{ messages?: Message[] }>(path);
      const earlier = page.messages ?? [];
      if (!earlier.length) setOlderLeft(false);
      else setMessages((list) => [...earlier, ...list]);
    } catch {
      // the transcript stays where it was
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const words = text.trim();
    if (!client || (!words && !picked) || sending) return;
    const image = picked;
    setSending(true);
    setError("");
    const local: Message = { id: `local-${Date.now()}`, role: "user", kind: "text", text: words || "[attachment]", pending: true };
    try {
      let outgoing = words;
      if (image) outgoing = composeOutgoing(words, [await client.uploadImage(bytesOf(image.base64), image.mime)]);
      local.text = outgoing;
      setMessages((list) => [...list, local]);
      setText("");
      setPicked(null);
      if (kind === "room") {
        await client.request(`/api/bloks/${id}/messages`, { method: "POST", body: { text: outgoing } });
      } else {
        await client.request(`/api/bots/${id}/messages`, { method: "POST", body: { text: outgoing, ...(thread ? { taskId: thread } : {}) } });
      }
    } catch (err) {
      setMessages((list) => list.filter((item) => item.id !== local.id));
      setText(words);
      setPicked(image);
      speak(err);
    } finally {
      setSending(false);
    }
  };

  const stop = () => {
    if (kind === "bot") client?.request(`/api/bots/${id}/interrupt`, { method: "POST", body: thread ? { taskId: thread } : {} }).catch(speak);
  };

  const newLane = async () => {
    if (!client) return;
    try {
      const made = await client.request<{ bot?: { activeTaskId?: string } }>(`/api/bots/${id}/tasks`, { method: "POST", body: {} });
      await workspace?.reload();
      if (made.bot?.activeTaskId) setLaneId(made.bot.activeTaskId);
    } catch (err) {
      speak(err);
    }
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    // the picker hands back JPEG or PNG; HEIC photos are converted by quality < 1
    setPicked({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType === "image/png" ? "image/png" : "image/jpeg" });
  };

  const answer = useCallback((message: Message, card: OptionCard, reply: string) => {
    if (!client) return;
    const botId = kind === "bot" ? id : message.from ?? "";
    const request = cardAnswerRequest(card, reply, {
      botId,
      messageId: message.id,
      roomId: kind === "room" ? id : undefined,
      taskId: kind === "bot" ? thread : undefined,
    });
    const before = message;
    const settle = (item: Message) => (item.id === message.id ? { ...item, card: { ...card, answered: reply } } : item);
    setMessages((list) => list.map(settle));
    client.request(request.path, { method: "POST", body: request.body }).then(
      () => {
        if (request.thenMark) void client.request(request.thenMark, { method: "PATCH", body: { answered: reply } }).catch(() => {});
      },
      (err) => {
        // an answer that did not go puts the card back, so it can be pressed again
        setMessages((list) => list.map((item) => (item.id === message.id ? before : item)));
        Alert.alert("Not sent", err instanceof Error ? err.message : String(err));
      },
    );
  }, [client, kind, id, thread]);

  /** A click in a generated answer: the person's next message, to the agent
   * that drew it. In a room it is addressed to that agent, so it answers. */
  const sayRef = useRef<(words: string, from?: string) => void>(() => {});
  sayRef.current = (words, from) => {
    if (!client) return;
    const named = kind === "room" && from ? workspace?.bots.find((item) => item.id === from)?.name : undefined;
    const outgoing = named ? `@${named} ${words}` : words;
    const local: Message = { id: `local-${Date.now()}`, role: "user", kind: "text", text: outgoing, pending: true };
    setMessages((list) => [...list, local]);
    const request = kind === "room"
      ? client.request(`/api/bloks/${id}/messages`, { method: "POST", body: { text: outgoing } })
      : client.request(`/api/bots/${id}/messages`, { method: "POST", body: { text: outgoing, ...(thread ? { taskId: thread } : {}) } });
    request.catch((err) => {
      setMessages((list) => list.filter((item) => item.id !== local.id));
      speak(err);
    });
  };

  const botsNow = workspace?.bots;
  const context = useMemo<RowContext>(() => ({
    client,
    host: { say: (words) => sayRef.current(words) },
    room: kind === "room",
    nameOf: (botId) => botsNow?.find((item) => item.id === botId)?.name,
    colorOf: (botId) => botsNow?.find((item) => item.id === botId)?.color,
    onAnswer: answer,
  }), [client, kind, botsNow, answer]);

  const running = working || Boolean(lanes.find((item) => item.id === thread)?.state === "working") || (lanes.length === 0 && Boolean(bot?.busy));
  const rows = useMemo(() => rowsOf(messages, { running, room: kind === "room" }).reverse().slice(E2E ? e2e.skip : 0), [messages, running, kind]);
  const waiting = useMemo(() => messages.filter((message) => message.queued && !message.deleted), [messages]);
  const canSend = (text.trim().length > 0 || picked) && !sending;
  const lane = lanes.find((item) => item.id === thread);
  const fill = measuredContext(lane?.context);
  const engine = engines.find((item) => item.instanceId === bot?.modelSelection?.instanceId);
  const shownEffort = clampEffort(bot?.effort, effortLevels(engine, bot?.modelSelection?.model));
  const measure = wide ? styles.measure : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
      {wide && (
        <View style={[styles.title, { borderBottomColor: colors.border }]}>
          <Avatar name={name} color={bot?.color} size={30} />
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{name}</Text>
          {!!(bot?.title || bot?.description) && <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{bot?.title || bot?.description}</Text>}
        </View>
      )}
      {kind === "bot" && lanes.length > 0 && (
        <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lanes}>
            {lanes.map((lane) => {
              const on = lane.id === thread;
              return (
                <Pressable key={lane.id} accessibilityRole="button" onPress={() => setLaneId(lane.id)} style={[styles.lane, { backgroundColor: on ? colors.accent : colors.surface }]}>
                  <Text numberOfLines={1} style={{ color: on ? colors.onAccent : lane.state === "needs-you" ? colors.warning : colors.text, fontSize: 13, maxWidth: 160 }}>
                    {lane.unread && !on ? "• " : ""}{lane.title || "Conversation"}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={newLane} style={[styles.lane, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, fontSize: 13 }}>+ New</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}
      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(row) => row.key}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={streaming ? <View style={[styles.streaming, measure]}><Markdown text={streaming} streaming /></View> : null}
          ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} /> : null}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted, transform: [{ scaleY: -1 }] }]}>Nothing said here yet.</Text>}
          renderItem={({ item }) => (
            <View style={measure}>
              <RowView row={item} context={context} />
            </View>
          )}
        />
      )}
      {waiting.length > 0 && (
        <Text numberOfLines={2} style={[styles.waiting, measure, { color: colors.muted }]}>Waiting to send: {waiting.map((item) => item.text).join(" · ")}</Text>
      )}
      {!!error && <Text style={[styles.waiting, measure, { color: colors.danger }]}>{error}</Text>}
      {picked && (
        <Pressable accessibilityRole="button" onPress={() => setPicked(null)} style={[styles.chip, measure]}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Photo attached. Tap to remove.</Text>
        </Pressable>
      )}
      <View style={[styles.composerWrap, { paddingBottom: bot ? 0 : Math.max(insets.bottom, 8) }]}>
        <View style={[styles.composer, measure, styles.composerBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a photo" onPress={pick} style={styles.icon}>
            <Text style={{ color: colors.muted, fontSize: 24, lineHeight: 28 }}>+</Text>
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={`Message ${name}`}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text }]}
          />
          {running && kind === "bot" && !canSend ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={stop} style={[styles.send, { backgroundColor: colors.secondary }]}>
              <View style={[styles.stopMark, { backgroundColor: colors.text }]} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!canSend} onPress={send} style={[styles.send, { backgroundColor: canSend ? colors.accent : colors.secondary }]}>
              {sending ? <ActivityIndicator /> : <Text style={{ color: canSend ? colors.onAccent : colors.muted, fontSize: 18, fontWeight: "600", lineHeight: 22 }}>↑</Text>}
            </Pressable>
          )}
        </View>
      </View>
      {bot && (
        <View style={[styles.under, measure, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Engine and model" hitSlop={6} onPress={() => setSheet("model")} style={styles.underButton}>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>
              {engine ? `${engine.displayName} · ` : ""}{selectionLabel(engines, bot.modelSelection)}{shownEffort ? ` · ${effortName(shownEffort)}` : ""} ▾
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Context and usage" hitSlop={6} onPress={() => setSheet("usage")} style={styles.underButton}>
            <Text style={{ color: fill && fill.fraction >= 0.8 ? colors.warning : colors.muted, fontSize: 13 }}>
              {fill ? `${contextPercent(fill)}% of context` : "Usage"}
            </Text>
          </Pressable>
        </View>
      )}
      {bot && (
        <>
          <ModelSheet
            visible={sheet === "model"}
            title={`${name}'s model`}
            engines={engines}
            selection={bot.modelSelection}
            effort={bot.effort}
            onClose={() => setSheet(null)}
            onPick={(selection) => patchBot({ modelSelection: selection })}
            onEffort={(effort) => patchBot({ effort })}
          />
          <UsageSheet visible={sheet === "usage"} onClose={() => setSheet(null)} client={client} bot={bot} lane={lane} engine={engine} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  measure: { width: "100%", maxWidth: READING_WIDTH, alignSelf: "center" },
  title: { flexDirection: "row", alignItems: "center", gap: 10, height: 52, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  under: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16 },
  underButton: { minHeight: 32, justifyContent: "center", flexShrink: 1 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 6 },
  composerBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, paddingHorizontal: 4, paddingVertical: 4 },
  stopMark: { width: 12, height: 12, borderRadius: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", padding: 32, fontSize: 15 },
  older: { padding: 12 },
  streaming: { paddingHorizontal: 16, paddingVertical: 6 },
  lanes: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  lane: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: "center" },
  waiting: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 6 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 36, maxHeight: 140, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 8, fontSize: 16 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
