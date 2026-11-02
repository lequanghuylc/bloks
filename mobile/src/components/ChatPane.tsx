import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

import { Avatar } from "./Avatar";
import { Markdown } from "./Markdown";
import { ActionSheet, EditSheet, ForwardSheet, ReplyChip } from "./MessageActions";
import { FileViewer, PickedPhoto, type OpenFile } from "./FileViewer";
import { RowView, type RowContext } from "./MessageRow";
import { ModelSheet } from "./ModelSheet";
import { UsageSheet } from "./UsageSheet";
import { WaitingCard } from "./WaitingCard";
import { WorkingLine } from "./WorkingLine";
import { excerptOf, splitWaiting, type ActionKey, type ReplyDraft } from "../lib/chatMeta.ts";
import { Unpaired } from "../lib/client.ts";
import { contextPercent, effortName, clampEffort, effortLevels, measuredContext, selectionLabel, type Engine } from "../lib/engines.ts";
import { useInstances } from "../lib/instances";
import { READING_WIDTH, useIsWide } from "../lib/layout";
import { chatKey, draftKey, peek, put, read, remove } from "../lib/localStore";
import { cardAnswerRequest, composeOutgoing, forCache, isProgressText, mergeLatest, upsert, type Lane, type Message, type OptionCard } from "../lib/messages.ts";
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
  const [text, showText] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const [acting, setActing] = useState<Message | null>(null);
  const [viewing, setViewing] = useState<OpenFile | null>(null);
  const [forwarding, setForwarding] = useState<{ message: Message; author: string } | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const inputRef = useRef<TextInput>(null);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const olderLeftRef = useRef(olderLeft);
  olderLeftRef.current = olderLeft;
  // Which conversation `messages` is, once it is known to belong to one, so an
  // empty list on the way between two is never saved over the second.
  const shownThread = useRef<string | undefined>(undefined);

  // What is typed and not yet sent is kept per conversation until it is sent.
  const textRef = useRef(text);
  textRef.current = text;
  const draftThread = useRef<string | undefined>(undefined);
  const keepDraft = useCallback((words: string) => {
    if (!draftThread.current) return;
    const key = draftKey(instanceId, draftThread.current);
    if (words) put(key, words);
    else remove(key);
  }, [instanceId]);
  const setText = useCallback((words: string) => {
    showText(words);
    keepDraft(words);
  }, [keepDraft]);

  useEffect(() => {
    if (!thread) return;
    let current = true;
    const came = draftThread.current;
    draftThread.current = thread;
    // Words typed before the first conversation was known belong to it; moving
    // from one conversation to another leaves them behind in the first.
    if (came) showText("");
    else if (textRef.current) keepDraft(textRef.current);
    const key = draftKey(instanceId, thread);
    const held = peek<string>(key);
    if (held) showText(held);
    else {
      void read<string>(key).then((saved) => {
        if (current && saved) showText((typed) => typed || saved);
      });
    }
    return () => {
      current = false;
    };
  }, [instanceId, thread, keepDraft]);

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
      const said = page.messages ?? [];
      setOlderLeft(mergeLatest(messagesRef.current, said, page.olderMessages, olderLeftRef.current).olderLeft);
      setMessages((list) => mergeLatest(list, said, page.olderMessages, olderLeftRef.current).messages);
      shownThread.current = thread;
      setError("");
    } catch (err) {
      if (threadRef.current === thread && !(err instanceof Unpaired) && messagesRef.current.length) {
        setError("Showing saved messages. This computer could not be reached.");
      } else speak(err);
    } finally {
      setLoading(false);
    }
  }, [client, kind, id, thread, speak]);

  useEffect(() => {
    let current = true;
    setStreaming("");
    // a quote is of a message in the conversation it was picked in
    setReplyTo(null);
    shownThread.current = undefined;
    type Kept = { messages: Message[]; olderLeft: boolean };
    const show = (kept: Kept | null) => {
      if (kept) {
        // anything the stream brought while this was being read is newer
        setMessages((list) => list.reduce((all, item) => upsert(all, item), kept.messages));
        setOlderLeft(kept.olderLeft);
        setLoading(false);
      }
      if (thread) shownThread.current = thread;
    };
    const key = thread ? chatKey(instanceId, thread) : null;
    const held = key ? peek<Kept>(key) : undefined;
    setMessages([]);
    if (held) show(held);
    else setLoading(true);
    void (async () => {
      if (key && !held) {
        const kept = await read<Kept>(key);
        if (!current) return;
        // only a kept conversation counts as shown: an empty one waits for the server
        if (kept) show(kept);
      }
      await load();
    })();
    if (kind === "bot" && !E2E) void client?.request(`/api/bots/${id}`, { method: "PATCH", body: { unread: false } }).catch(() => {});
    return () => {
      current = false;
    };
  }, [load, kind, id, client, instanceId, thread]);

  useEffect(() => {
    if (thread && shownThread.current === thread) put(chatKey(instanceId, thread), forCache(messages, olderLeft));
  }, [instanceId, thread, messages, olderLeft]);

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
    const quote = replyTo ?? undefined;
    setSending(true);
    setError("");
    const local: Message = { id: `local-${Date.now()}`, role: "user", kind: "text", text: words || "[attachment]", pending: true, replyTo: quote };
    try {
      let outgoing = words;
      if (image) outgoing = composeOutgoing(words, [await client.uploadImage(bytesOf(image.base64), image.mime)]);
      local.text = outgoing;
      setMessages((list) => [...list, local]);
      setText("");
      setPicked(null);
      setReplyTo(null);
      if (kind === "room") {
        await client.request(`/api/bloks/${id}/messages`, { method: "POST", body: { text: outgoing, replyTo: quote } });
      } else {
        await client.request(`/api/bots/${id}/messages`, { method: "POST", body: { text: outgoing, replyTo: quote, ...(thread ? { taskId: thread } : {}) } });
      }
    } catch (err) {
      setMessages((list) => list.filter((item) => item.id !== local.id));
      setText(words);
      setPicked(image);
      setReplyTo(quote ?? null);
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

  // On the server a message's thread is the lane it is in, or the room.
  const messageThread = thread ?? "";
  const authorOf = useCallback((message: Message) => {
    if (message.role === "user") return message.author || message.telegramPerson?.name || message.telegramDelegate?.name || "You";
    return (message.from && workspace?.bots.find((item) => item.id === message.from)?.name) || name;
    // only the names matter, and they change with the agents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.bots, name]);

  const react = useCallback((message: Message, emoji: string) => {
    client?.request(`/api/threads/${messageThread}/messages/${message.id}/react`, { method: "POST", body: { emoji } }).catch(() => {});
  }, [client, messageThread]);

  const failed = (what: string) => (err: unknown) => Alert.alert(what, err instanceof Error ? err.message : String(err));

  const act = (key: ActionKey, message: Message) => {
    setActing(null);
    const path = `/api/threads/${messageThread}/messages/${message.id}`;
    // iOS will not show anything new while the sheet is still leaving
    const next = (run: () => void) => setTimeout(run, 350);
    switch (key) {
      case "reply":
        setReplyTo({ id: message.id, author: authorOf(message), excerpt: excerptOf(message) });
        next(() => inputRef.current?.focus());
        break;
      case "forward":
        next(() => setForwarding({ message, author: authorOf(message) }));
        break;
      case "edit":
        next(() => setEditing(message));
        break;
      case "rewind":
        next(() => Alert.alert("Rewind to before this message?", "It and everything after are removed, and file changes since then are undone. Your message returns to the box.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Rewind",
            style: "destructive",
            onPress: () => {
              client?.request<{ text?: string }>(`/api/threads/${messageThread}/rewind`, { method: "POST", body: { messageId: message.id } })
                .then((result) => {
                  setText(result.text ?? "");
                  return load();
                })
                .catch(failed("Not rewound"));
            },
          },
        ]));
        break;
      case "delete":
        next(() => Alert.alert("Delete this message?", "This can't be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => void client?.request(path, { method: "DELETE" }).catch(failed("Not deleted")) },
        ]));
        break;
    }
  };

  const forwardTo = (to: { kind: "bot" | "room"; id: string }, words: string) => {
    if (!client) return Promise.reject(new Error("Not connected"));
    const path = to.kind === "room" ? `/api/bloks/${to.id}/messages` : `/api/bots/${to.id}/messages`;
    return client.request(path, { method: "POST", body: { text: words } });
  };

  const sendNow = () => {
    client?.request(`/api/bots/${id}/queued/now`, { method: "POST", body: { taskId: thread } }).catch(failed("Not sent"));
  };

  // Sent again as what it says now, and the one that never went is cleared
  // once the new one is in.
  const sendAgain = (message: Message) => {
    client?.request(`/api/bots/${id}/messages`, { method: "POST", body: { text: message.text, taskId: thread } })
      .then(() => client.request(`/api/threads/${messageThread}/messages/${message.id}`, { method: "DELETE" }))
      .catch(failed("Not sent"));
  };

  const botsNow = workspace?.bots;
  const context = useMemo<RowContext>(() => ({
    client,
    host: { say: (words) => sayRef.current(words) },
    room: kind === "room",
    nameOf: (botId) => botsNow?.find((item) => item.id === botId)?.name,
    colorOf: (botId) => botsNow?.find((item) => item.id === botId)?.color,
    onAnswer: answer,
    onActions: setActing,
    onReact: react,
    agentId: kind === "bot" ? id : undefined,
    onOpenFile: setViewing,
  }), [client, kind, id, botsNow, answer, react]);

  const roomWorkers = useMemo(
    () => (kind === "room" ? (botsNow ?? []).filter((item) => item.tasks?.some((task) => task.room === id)).map((item) => item.name) : []),
    [kind, botsNow, id],
  );
  const running = kind === "room"
    ? roomWorkers.length > 0
    : working || Boolean(lanes.find((item) => item.id === thread)?.state === "working") || (lanes.length === 0 && Boolean(bot?.busy));
  const rows = useMemo(() => rowsOf(messages, { running, room: kind === "room" }).reverse().slice(E2E ? e2e.skip : 0), [messages, running, kind]);
  const { said, waiting } = useMemo(() => splitWaiting(messages), [messages]);
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
                <Pressable key={lane.id} accessibilityRole="button" accessibilityLabel={lane.state === "working" ? `${lane.title || "Conversation"}, working` : undefined} onPress={() => setLaneId(lane.id)} style={[styles.lane, { backgroundColor: on ? colors.accent : colors.surface }]}>
                  {lane.state === "working" && <ActivityIndicator size="small" color={on ? colors.onAccent : colors.accent} style={styles.laneSpinner} />}
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
      {loading && !messages.length ? (
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
          ListHeaderComponent={(
            <View style={measure}>
              {!!streaming && <View style={styles.streaming}><Markdown text={streaming} streaming /></View>}
              <WorkingLine
                threadKey={`${kind}:${id}:${thread}`}
                working={running}
                streaming={streaming}
                said={said}
                label={kind === "room" && roomWorkers.length ? `${roomWorkers.join(", ")} ${roomWorkers.length === 1 ? "is" : "are"} working` : undefined}
                onStop={kind === "bot" ? stop : undefined}
              />
            </View>
          )}
          ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} /> : null}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted, transform: [{ scaleY: -1 }] }]}>Nothing said here yet.</Text>}
          renderItem={({ item }) => (
            <View style={measure}>
              <RowView row={item} context={context} />
            </View>
          )}
        />
      )}
      <WaitingCard
        waiting={waiting}
        threadId={messageThread}
        client={client}
        working={running}
        onSendNow={kind === "bot" ? sendNow : undefined}
        onSendAgain={kind === "bot" ? sendAgain : undefined}
        style={measure}
      />
      {!!error && <Text style={[styles.waiting, measure, { color: colors.danger }]}>{error}</Text>}
      {replyTo && <ReplyChip draft={replyTo} onClear={() => setReplyTo(null)} style={measure} />}
      <View style={[styles.composerWrap, { paddingBottom: bot ? 0 : Math.max(insets.bottom, 8) }]}>
        <View style={[measure, styles.composerBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {picked && <PickedPhoto uri={picked.uri} sending={sending} onOpen={() => setViewing({ name: "Attached photo", source: { uri: picked.uri }, picture: true })} onRemove={() => setPicked(null)} />}
          <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a photo" onPress={pick} style={styles.icon}>
            <Text style={{ color: colors.muted, fontSize: 24, lineHeight: 28 }}>+</Text>
          </Pressable>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            multiline
            placeholder={replyTo ? `Reply to ${replyTo.author}` : running && kind === "bot" ? `Add to what ${name} is doing` : `Message ${name}`}
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
      <FileViewer file={viewing} onClose={() => setViewing(null)} />
      <ActionSheet message={acting} author={acting ? authorOf(acting) : ""} room={kind === "room"} onClose={() => setActing(null)} onReact={react} onAction={act} />
      <ForwardSheet target={forwarding} bots={botsNow ?? []} rooms={workspace?.rooms ?? []} onClose={() => setForwarding(null)} onSend={forwardTo} />
      <EditSheet
        message={editing}
        threadId={messageThread}
        client={client}
        agent={name}
        onClose={() => setEditing(null)}
        onRedone={(result, words) => {
          setEditing(null);
          if (result.sent === false) {
            setText(result.text ?? words);
            setError(result.error ?? "Rewound, but your message wasn't sent.");
          }
          void load();
        }}
      />
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
  lane: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 16 },
  laneSpinner: { transform: [{ scale: 0.7 }], width: 16, height: 16 },
  waiting: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 4 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 36, maxHeight: 140, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 8, fontSize: 16 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
