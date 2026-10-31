// One row of a transcript, as the web's ChatView and chat/Bubble.tsx draw it.
import { memo, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { Client } from "../lib/client.ts";
import { answersElsewhere, baseName, cardIsOpen, isApproval, lineOf, readSent, type Message, type OptionCard } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { foldLine, toolSummary, plainRows, type Row, type TurnFold } from "../lib/turnFold.ts";
import { Avatar } from "./Avatar";
import type { GenUiHost } from "./GenUI";
import { Markdown } from "./Markdown";

export type RowContext = {
  client: Client | null;
  host: GenUiHost;
  /** A room's speakers, or an agent named on a line. */
  nameOf: (id: string) => string | undefined;
  colorOf: (id: string) => string | undefined;
  room: boolean;
  onAnswer: (message: Message, card: OptionCard, answer: string) => void;
};

function stamp(at: number | undefined): string {
  if (!at) return "";
  const date = new Date(at);
  const now = new Date();
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return date.toDateString() === now.toDateString() ? time : `${date.getDate()}/${date.getMonth() + 1}`;
}

function ToolLines({ tools }: { tools: Message[] }) {
  const colors = useColors();
  return (
    <View style={styles.toolLines}>
      {tools.map((item) => (
        <Text key={item.id} selectable numberOfLines={4} style={[styles.small, { color: item.tool?.ok === false ? colors.danger : colors.muted }]}>
          {item.tool?.name}{item.tool?.command ? `: ${item.tool.command}` : ""}
        </Text>
      ))}
    </View>
  );
}

/** A run of tool calls, one line that opens (src/components/ToolRun.tsx). */
function ToolRun({ tools }: { tools: Message[] }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const going = tools.some((item) => item.tool && item.tool.ok === undefined && !item.tool.stopped);
  return (
    <View style={styles.pad}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.chip}>
        <Text style={[styles.small, { color: colors.muted }]}>{going ? "Working · " : ""}{toolSummary(tools.map((item) => item.tool?.name ?? ""))} {open ? "⌃" : "›"}</Text>
      </Pressable>
      {open && <ToolLines tools={tools} />}
    </View>
  );
}

/** A finished turn's work, folded (src/components/TurnFoldLine.tsx). */
function FoldRow({ fold, context }: { fold: TurnFold; context: RowContext }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <View style={styles.pad}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.chip}>
          <Text style={[styles.small, { color: colors.muted }]}>{foldLine(fold, context.nameOf)} {open ? "⌃" : "›"}</Text>
        </Pressable>
      </View>
      {open && <View style={styles.foldBody}>{plainRows(fold.messages).map((row) => <RowView key={row.key} row={row} context={context} />)}</View>}
    </View>
  );
}

/** To or from another agent: a compact row that opens to the words, never a
 * bubble that looks like the person's own (src/components/AgentExchange.tsx). */
function ExchangeRow({ message, context }: { message: Message; context: RowContext }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const note = message.takeBack ?? message.agent!;
  const incoming = !message.takeBack && message.agent?.dir === "in";
  const name = context.nameOf(note.peerId) ?? note.peerName;
  const label = message.takeBack ? `Took back from ${name}` : incoming ? `Message from ${name}` : `Messaged ${name}`;
  const status = message.takeBack ? undefined : message.agent?.status;
  const failed = status === "failed";
  const words = status === "queued" ? "Waiting" : failed ? "Not delivered" : status === "uncertain" ? "May not have arrived" : "";
  const preview = (message.text ?? "").replace(/\s+/g, " ").trim();
  return (
    <View style={styles.pad}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.exchange}>
        <Text style={{ color: failed ? colors.danger : colors.accent, fontSize: 13 }}>{incoming ? "↙" : "↗"}</Text>
        <Avatar name={name} color={context.colorOf(note.peerId)} size={16} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {!!words && <Text style={{ color: failed ? colors.danger : colors.muted, fontSize: 14 }}>({words})</Text>}
        {!open && !!preview && <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14, flexShrink: 1 }}>{preview}</Text>}
        <Text style={{ color: colors.muted, fontSize: 12 }}>{stamp(message.at)}</Text>
      </Pressable>
      {open && !!message.text && <View style={[styles.exchangeBody, { borderLeftColor: colors.border }]}><Markdown text={message.text} ui={message.ui} streaming={false} /></View>}
    </View>
  );
}

function CardRow({ card, onAnswer }: { card: OptionCard; onAnswer: (card: OptionCard, answer: string) => void }) {
  const colors = useColors();
  const [typed, setTyped] = useState("");
  const live = cardIsOpen(card);
  const settled = card.answered ? `${card.answeredBy ? `${card.answeredBy}: ` : ""}${card.answered}` : card.closed || (card.cutOff ? "Cut off when Bloks stopped" : "");
  const elsewhere = answersElsewhere(card);
  const asksInWords = Boolean(card.requestId) && !isApproval(card);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text selectable style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
      {!!card.subtitle && <Markdown text={card.subtitle} color={colors.muted} />}
      {!!settled && <Text style={[styles.small, { color: colors.muted }]}>{settled}</Text>}
      {live && elsewhere && <Text style={[styles.small, { color: colors.muted }]}>{card.open?.path ?? "Answer this one on your computer."}</Text>}
      {live && !elsewhere && (
        <View style={styles.options}>
          {card.options.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => onAnswer(card, option)}
              style={({ pressed }) => [styles.option, { backgroundColor: option === "Allow" ? colors.accent : "transparent", borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: option === "Allow" ? colors.onAccent : option === "Deny" ? colors.danger : colors.text, fontSize: 15, fontWeight: "500" }}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {live && !elsewhere && asksInWords && (
        <View style={styles.typedRow}>
          <TextInput value={typed} onChangeText={setTyped} placeholder="Or say" placeholderTextColor={colors.muted} style={[styles.typed, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
          <Pressable accessibilityRole="button" disabled={!typed.trim()} onPress={() => onAnswer(card, typed.trim())} style={styles.typedSend}>
            <Text style={{ color: typed.trim() ? colors.ink : colors.muted, fontWeight: "600" }}>Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function NoticeRow({ message }: { message: Message }) {
  const colors = useColors();
  const words = lineOf(message);
  if (message.sessionReset || message.compaction || (message.intent && message.event)) {
    return <Text selectable style={[styles.notice, { color: colors.muted }]}>{words}</Text>;
  }
  const short = message.goal === "blocked" || message.goal === "out" || message.goal === "paused";
  const calm = message.imported || (message.intent && !message.event) || (message.goal && !short && message.goal !== "done");
  const done = message.goal === "done";
  const ink = calm ? colors.muted : done ? colors.success : colors.warning;
  return (
    <View style={styles.pad}>
      <View style={[styles.noticeCard, calm ? { backgroundColor: colors.card, borderColor: colors.border } : { backgroundColor: `${ink}0D`, borderColor: `${ink}4D` }]}>
        <Text style={{ color: ink, fontSize: 14, lineHeight: 20 }}>{calm ? "ⓘ" : done ? "✓" : "⚠"}</Text>
        <Text selectable style={{ color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{words}</Text>
      </View>
    </View>
  );
}

function ChangesRow({ message }: { message: Message }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const changes = message.changes;
  if (!changes) return null;
  const own = changes.files.filter((file) => !file.shared);
  const added = own.reduce((sum, file) => sum + (file.added ?? 0), 0);
  const removed = own.reduce((sum, file) => sum + (file.removed ?? 0), 0);
  const total = Math.max(0, changes.total - (changes.shared?.total ?? 0));
  return (
    <View style={styles.pad}>
      <View style={[styles.changes, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.changesHead}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>Changed {total} {total === 1 ? "file" : "files"}</Text>
          {(added > 0 || removed > 0) && (
            <Text style={{ fontSize: 13 }}><Text style={{ color: colors.success }}>+{added}</Text> <Text style={{ color: colors.danger }}>-{removed}</Text></Text>
          )}
          <Text style={{ color: colors.muted, fontSize: 14 }}>{open ? "⌃" : "⌄"}</Text>
        </Pressable>
        {open && own.map((file) => (
          <View key={file.path} style={styles.changesFile}>
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, flex: 1 }}>{file.path}</Text>
            {(file.added !== undefined || file.removed !== undefined) && (
              <Text style={{ fontSize: 12 }}><Text style={{ color: colors.success }}>+{file.added ?? 0}</Text> <Text style={{ color: colors.danger }}>-{file.removed ?? 0}</Text></Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function MineRow({ message, client }: { message: Message; client: Client | null }) {
  const colors = useColors();
  const sent = readSent(message.text ?? "");
  return (
    <View style={styles.mineWrap}>
      {sent.images.map((path) => (client ? <Image key={path} accessibilityLabel={baseName(path)} source={client.source(`/api/attachments/${encodeURIComponent(baseName(path))}`)} resizeMode="cover" style={styles.sentImage} /> : null))}
      {(sent.words || sent.files.length > 0 || sent.pastes > 0) && (
        <View style={[styles.mine, { backgroundColor: colors.mine, opacity: message.pending ? 0.6 : 1 }]}>
          {(sent.files.length > 0 || sent.pastes > 0) && (
            <View style={styles.sentChips}>
              {sent.files.map((path) => <Text key={path} style={[styles.sentChip, { color: colors.onMine, backgroundColor: colors.surface }]}>{baseName(path)}</Text>)}
              {sent.pastes > 0 && <Text style={[styles.sentChip, { color: colors.onMine, backgroundColor: colors.surface }]}>Pasted text</Text>}
            </View>
          )}
          {!!sent.words && <Markdown text={sent.words} color={colors.onMine} />}
        </View>
      )}
    </View>
  );
}

/** What recall added to the turn this started (src/components/RecalledNotes.tsx). */
function Recalled({ message }: { message: Message }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const notes = message.recalled ?? [];
  if (!notes.length) return null;
  return (
    <View style={styles.recalled}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}>
        <Text style={[styles.small, { color: colors.muted }]}>Recalled {notes.length} {notes.length === 1 ? "note" : "notes"} {open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open && notes.map((note, index) => <Text key={index} numberOfLines={1} style={[styles.small, { color: colors.muted }]}>{[note.where, note.text].filter(Boolean).join(": ") || "A note"}</Text>)}
    </View>
  );
}

function Wide({ children }: { children: ReactNode }) {
  return <View style={styles.pad}>{children}</View>;
}

function SaidRow({ message, afterAgent, context }: { message: Message; afterAgent?: { peerName: string }; context: RowContext }) {
  const colors = useColors();
  switch (message.kind) {
    case "options":
      return message.card ? <CardRow card={message.card} onAnswer={(card, answer) => context.onAnswer(message, card, answer)} /> : null;
    case "screen":
      return message.png ? <Image source={{ uri: `data:${message.mime ?? "image/png"};base64,${message.png}` }} resizeMode="contain" style={styles.screen} accessibilityLabel="The agent's screen" /> : null;
    case "notice":
      return <NoticeRow message={message} />;
    case "changes":
      return <ChangesRow message={message} />;
    case "artifact":
      return (
        <Wide>
          <View style={[styles.artifact, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: "500", flex: 1 }}>{message.artifact?.name}</Text>
            {!!message.artifact?.size && <Text style={{ color: colors.muted, fontSize: 13 }}>{Math.max(1, Math.round(message.artifact.size / 1024))} KB</Text>}
          </View>
        </Wide>
      );
    case "connector":
    case "secret":
    case "component":
      return <Text style={[styles.notice, { color: colors.muted }]}>{message.kind === "component" ? "Open Full app to see this one" : "This one is finished on your computer"}</Text>;
  }
  if (message.role === "user") {
    const from = message.author || message.telegramPerson?.name || message.telegramDelegate?.name;
    return (
      <View>
        {!!from && <Text style={[styles.small, styles.mineName, { color: colors.muted }]}>{from}</Text>}
        <MineRow message={message} client={context.client} />
        <Recalled message={message} />
      </View>
    );
  }
  const speaker = context.room && message.from ? context.nameOf(message.from) : undefined;
  if (!message.text) return null;
  const words = <Markdown text={message.text} ui={message.ui} streaming={false} host={context.host} />;
  return (
    <View style={styles.theirs}>
      {!!afterAgent && <Text style={[styles.small, { color: colors.muted }]}>↳ After a message from {afterAgent.peerName}</Text>}
      {speaker ? (
        <View style={styles.group}>
          <Avatar name={speaker} color={message.from ? context.colorOf(message.from) : undefined} size={26} />
          <View style={styles.groupBody}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{speaker}</Text>
            {words}
          </View>
        </View>
      ) : words}
    </View>
  );
}

export const RowView = memo(function RowView({ row, context }: { row: Row; context: RowContext }): ReactNode {
  const colors = useColors();
  switch (row.type) {
    case "fold":
      return <FoldRow fold={row.fold} context={context} />;
    case "tools":
      return <ToolRun tools={row.tools} />;
    case "exchange":
      return <ExchangeRow message={row.message} context={context} />;
    case "quiet":
      return <Text style={[styles.notice, { color: colors.muted }]}>{row.messages.length === 1 ? "A quiet check-in" : `${row.messages.length} quiet check-ins`}</Text>;
    case "taken":
      return <Text style={[styles.notice, { color: colors.muted, fontStyle: "italic" }]}>Message taken back</Text>;
    case "message":
      return <SaidRow message={row.message} afterAgent={row.afterAgent} context={context} />;
  }
});

const styles = StyleSheet.create({
  small: { fontSize: 13, lineHeight: 18 },
  pad: { paddingHorizontal: 16, paddingVertical: 4, alignItems: "flex-start" },
  chip: { paddingHorizontal: 6, paddingVertical: 5, minHeight: 30, justifyContent: "center" },
  recalled: { alignItems: "flex-end", paddingHorizontal: 16, gap: 2 },
  toolLines: { gap: 4, paddingTop: 6, paddingLeft: 4 },
  foldBody: { opacity: 0.85 },
  exchange: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%", minHeight: 30 },
  exchangeBody: { borderLeftWidth: 2, paddingLeft: 12, marginTop: 4, marginLeft: 6, alignSelf: "stretch" },
  notice: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 4, textAlign: "center" },
  noticeCard: { flexDirection: "row", gap: 10, maxWidth: 560, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  changes: { width: "100%", maxWidth: 520, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 },
  changesHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 },
  changesFile: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  artifact: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 420, width: "100%", borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  mineWrap: { alignItems: "flex-end", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, gap: 6 },
  mineName: { textAlign: "right", paddingHorizontal: 16 },
  mine: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  sentImage: { width: 220, height: 220, borderRadius: 12 },
  sentChips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 },
  sentChip: { fontSize: 13, borderRadius: 8, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 2 },
  theirs: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  group: { flexDirection: "row", gap: 10 },
  groupBody: { flex: 1, minWidth: 0, gap: 4 },
  screen: { height: 280, marginHorizontal: 16, marginVertical: 4 },
  card: { marginHorizontal: 16, marginVertical: 6, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  typedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typed: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
  typedSend: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
});
