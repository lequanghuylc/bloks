import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { FileViewer, PickedPhoto, type OpenFile } from "../components/FileViewer";
import { Markdown } from "../components/Markdown";
import { ActionSheet, ReplyChip } from "../components/MessageActions";
import { WaitingCard } from "../components/WaitingCard";
import { WorkingLine } from "../components/WorkingLine";
import { RowView, type RowContext } from "../components/MessageRow";
import { FIXTURE } from "../lib/e2eFixture";
import { artifactPath } from "../lib/chatMeta.ts";
import { Client } from "../lib/client.ts";
import type { Message } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { rowsOf } from "../lib/turnFold.ts";

const context: RowContext = { client: null, host: { say: () => {} }, nameOf: () => undefined, colorOf: () => undefined, room: false, onAnswer: () => {}, onActions: () => {}, onReact: () => {} };

const ago = (minutes: number) => Date.now() - minutes * 60000;
const SAID: Message[] = [
  { id: "a", role: "user", kind: "text", at: ago(30), text: "Clean up the temp folders please", reactions: { "👍": ["user"] } },
  { id: "b", role: "bot", kind: "text", at: ago(29), text: "They hold **53 MB**. Say the word and I'll purge them.", reactions: { "🎉": ["user", "b1"] } },
  { id: "c", role: "user", kind: "text", at: ago(20), text: "Go ahead", replyTo: { author: "M14", excerpt: "They hold 53 MB. Say the word and I'll purge them." }, editedAt: ago(19) },
  { id: "d", role: "bot", kind: "text", at: ago(19), text: "File is clean. Now the settings lib:" },
  { id: "e", role: "bot", kind: "activity", at: ago(1), tool: { name: "Bash", command: "npm test" } },
];
const WAITING: Message[] = [
  { id: "q", role: "user", kind: "text", queued: true, at: ago(18), text: "Yours: also empty the cache" },
  { id: "r", role: "user", kind: "text", queued: true, at: ago(17), agent: { dir: "in", peerId: "a", peerName: "Ava" }, text: "Huy asking if live. Status check: /api/settings is 404 on production; toggle code is uncommitted on mvp" },
];

/** A running chat's parts together, with no server behind them (?actions=1). */
function ActionsFixture() {
  const colors = useColors();
  const [acting, setActing] = useState<Message | null>(null);
  const rows = useMemo(() => rowsOf(SAID, { running: true, room: false }), []);
  const [viewing, setViewing] = useState<OpenFile | null>(null);
  // ?api= names a server to draw shared files from
  const api = typeof location !== "undefined" ? new URLSearchParams(location.search).get("api") : null;
  const local = { ...context, onActions: setActing, onOpenFile: setViewing, client: api ? new Client(fetch, api, null) : null };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }}>
        {rows.map((row) => <View key={row.key}><RowView row={row} context={local} /></View>)}
        {new URLSearchParams(location.search).get("file")?.split(",").map((name) => <RowView key={name} row={{ type: "message", key: name, message: { id: name, role: "bot", kind: "artifact", from: new URLSearchParams(location.search).get("bot") ?? "b", at: ago(1), artifact: { name, size: 157000 } } }} context={local} />)}
        <WorkingLine threadKey="fixture" working streaming="" said={SAID} onStop={() => {}} />
      </ScrollView>
      <WaitingCard waiting={WAITING} threadId="t" client={null} working onSendNow={() => {}} />
      <ReplyChip draft={{ author: "M14", excerpt: "They hold 53 MB. Say the word and I'll purge them." }} onClear={() => {}} />
      {!!local.client && (
        <View style={{ margin: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 4, backgroundColor: colors.card }}>
          <PickedPhoto uri={local.client.source(artifactPath(new URLSearchParams(location.search).get("bot") ?? "b", new URLSearchParams(location.search).get("file") ?? "")).uri} sending={false} onOpen={() => {}} onRemove={() => {}} />
          <Text style={{ color: colors.muted, padding: 8, fontSize: 16 }}>Message M14</Text>
        </View>
      )}
      <FileViewer file={viewing} onClose={() => setViewing(null)} />
      <ActionSheet message={acting} author="M14" room={false} onClose={() => setActing(null)} onReact={() => {}} onAction={() => setActing(null)} />
    </View>
  );
}

/** Every shape, or a saved chat when the page is given one (src/lib/e2e.ts). */
export function FixtureScreen() {
  const colors = useColors();
  const actions = typeof location !== "undefined" && new URLSearchParams(location.search).has("actions");
  const chat = typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("chat") ?? "";
  const [messages, setMessages] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!chat) return;
    void fetch(`/${chat}.json`).then((res) => res.json()).then(setMessages);
  }, [chat]);
  const rows = useMemo(() => (messages ? rowsOf(messages, { running: false, room: false }) : []), [messages]);
  if (actions) return <ActionsFixture />;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, width: "100%", maxWidth: 820, alignSelf: "center" }}>
      {chat
        ? rows.map((row) => <View key={row.key}><RowView row={row} context={context} /></View>)
        : <Markdown text={FIXTURE.text ?? ""} ui={FIXTURE.ui} streaming={false} host={{ say: () => {} }} />}
      {chat && !messages && <Text style={{ color: colors.muted }}>Loading</Text>}
    </ScrollView>
  );
}
