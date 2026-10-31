// A reply as the web draws it (src/components/Markdown.tsx): headings, lists
// that nest, tasks, quotes, tables, code, links, and generated interface where
// its fence sits.
import { memo, useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { parseBlocks, parseInline, readableWords, safeHttpUrl, type Block, type Inline as InlineNode } from "../lib/markdown.ts";
import type { UiEntry } from "../lib/messages.ts";
import { useColors, type Colors } from "../lib/theme";
import { DataTable } from "./DataTable";
import { GenUI, type GenUiHost } from "./GenUI";

const mono = Platform.select({ ios: "Menlo", default: "monospace" });
export const BODY = { fontSize: 16, lineHeight: 24 };

function inlines(parts: InlineNode[], colors: Colors, ink: string, key = ""): ReactNode[] {
  return parts.map((part, index) => {
    const id = `${key}${index}`;
    switch (part.kind) {
      case "text":
        return part.text;
      case "code":
        return <Text key={id} style={{ fontFamily: mono, fontSize: 13, backgroundColor: colors.code }}>{part.text}</Text>;
      case "bold":
        return <Text key={id} style={{ fontWeight: "600" }}>{inlines(part.children, colors, ink, `${id}-`)}</Text>;
      case "italic":
        return <Text key={id} style={{ fontStyle: "italic" }}>{inlines(part.children, colors, ink, `${id}-`)}</Text>;
      case "strike":
        return <Text key={id} style={{ textDecorationLine: "line-through" }}>{inlines(part.children, colors, ink, `${id}-`)}</Text>;
      case "link": {
        const url = safeHttpUrl(part.href);
        return (
          <Text key={id} style={url ? { color: colors.ink, textDecorationLine: "underline" } : undefined} onPress={url ? () => void Linking.openURL(url) : undefined}>
            {inlines(part.children, colors, ink, `${id}-`)}
          </Text>
        );
      }
    }
  });
}

export function InlineText({ text, color, size, weight }: { text: string; color?: string; size?: number; weight?: "400" | "500" | "600" }) {
  const colors = useColors();
  const ink = color ?? colors.text;
  const parts = useMemo(() => parseInline(text), [text]);
  return (
    <Text selectable style={{ color: ink, fontSize: size ?? BODY.fontSize, lineHeight: size ? Math.round(size * 1.45) : BODY.lineHeight, fontWeight: weight }}>
      {inlines(parts, colors, ink)}
    </Text>
  );
}

export function CodeView({ lang, code }: { lang?: string; code: string }) {
  const colors = useColors();
  return (
    <View style={[styles.code, { backgroundColor: colors.code, borderColor: colors.border }]}>
      {!!lang && <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 12, paddingTop: 8 }}>{lang}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeBody}>
        <Text selectable style={{ fontFamily: mono, fontSize: 13, lineHeight: 19, color: colors.text }}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const HEADING_SIZE = [22, 19, 17, 16, 16, 16];

function ListBlock({ block, ink }: { block: Extract<Block, { kind: "list" }>; ink: string }) {
  const colors = useColors();
  return (
    <View style={styles.list}>
      {block.items.map((item, index) => (
        <View key={index} style={styles.item}>
          <View style={styles.mark}>
            {item.task !== null ? (
              <View style={[styles.box, { borderColor: colors.muted, backgroundColor: item.task ? colors.accent : "transparent" }]}>
                {item.task && <Text style={{ color: colors.onAccent, fontSize: 10, lineHeight: 12 }}>✓</Text>}
              </View>
            ) : (
              <Text style={{ color: colors.muted, ...BODY }}>{block.ordered ? `${block.start + index}.` : "•"}</Text>
            )}
          </View>
          <View style={styles.itemBody}>
            <InlineText text={item.text} color={ink} />
            {item.children.map((child, at) => (child.kind === "list" ? <ListBlock key={at} block={child} ink={ink} /> : null))}
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockView({ block, ink, ui, streaming, host }: { block: Block; ink: string; ui?: UiEntry[]; streaming?: boolean; host?: GenUiHost }) {
  const colors = useColors();
  switch (block.kind) {
    case "heading":
      return <View style={{ marginTop: 6 }}><InlineText text={block.text} color={ink} size={HEADING_SIZE[block.level - 1]} weight="600" /></View>;
    case "paragraph":
      return <InlineText text={block.text} color={ink} />;
    case "quote":
      return <View style={[styles.quote, { borderLeftColor: colors.border }]}><InlineText text={block.text} color={colors.muted} /></View>;
    case "rule":
      return <View style={[styles.rule, { backgroundColor: colors.border }]} />;
    case "code":
      return <CodeView lang={block.lang} code={block.code} />;
    case "table":
      return <DataTable head={block.head} align={block.align} rows={block.rows} />;
    case "list":
      return <ListBlock block={block} ink={ink} />;
    case "ui": {
      const entry = block.fence === null ? undefined : ui?.find((item) => item.fence === block.fence);
      if (entry) return <GenUI entry={entry} host={host} />;
      if (streaming || !block.closed && streaming !== false) return <Text style={{ color: colors.muted, fontSize: 14 }}>Drawing…</Text>;
      const words = readableWords(block.source);
      return words ? <InlineText text={words} color={ink} /> : null;
    }
  }
}

export const Markdown = memo(function Markdown({ text, color, ui, streaming, host }: { text: string; color?: string; ui?: UiEntry[]; streaming?: boolean; host?: GenUiHost }) {
  const colors = useColors();
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View style={styles.stack}>
      {blocks.map((block, index) => <BlockView key={index} block={block} ink={color ?? colors.text} ui={ui} streaming={streaming} host={host} />)}
    </View>
  );
});

/** Words that open when pressed. */
export function Disclosure({ line, children }: { line: (open: boolean) => ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}>{line(open)}</Pressable>
      {open && children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  list: { gap: 4 },
  item: { flexDirection: "row", gap: 6 },
  mark: { minWidth: 18, alignItems: "flex-start", paddingTop: 0 },
  box: { width: 15, height: 15, marginTop: 3, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  itemBody: { flex: 1, gap: 4 },
  quote: { borderLeftWidth: 2, paddingLeft: 12 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  code: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  codeBody: { padding: 12 },
});
