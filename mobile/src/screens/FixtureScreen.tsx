import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Markdown } from "../components/Markdown";
import { RowView, type RowContext } from "../components/MessageRow";
import { FIXTURE } from "../lib/e2eFixture";
import type { Message } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { rowsOf } from "../lib/turnFold.ts";

const context: RowContext = { client: null, host: { say: () => {} }, nameOf: () => undefined, colorOf: () => undefined, room: false, onAnswer: () => {} };

/** Every shape, or a saved chat when the page is given one (src/lib/e2e.ts). */
export function FixtureScreen() {
  const colors = useColors();
  const chat = typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("chat") ?? "";
  const [messages, setMessages] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!chat) return;
    void fetch(`/${chat}.json`).then((res) => res.json()).then(setMessages);
  }, [chat]);
  const rows = useMemo(() => (messages ? rowsOf(messages, { running: false, room: false }) : []), [messages]);
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, width: "100%", maxWidth: 820, alignSelf: "center" }}>
      {chat
        ? rows.map((row) => <View key={row.key}><RowView row={row} context={context} /></View>)
        : <Markdown text={FIXTURE.text ?? ""} ui={FIXTURE.ui} streaming={false} host={{ say: () => {} }} />}
      {chat && !messages && <Text style={{ color: colors.muted }}>Loading</Text>}
    </ScrollView>
  );
}
