// One table, for markdown and generated answers alike, so the two kinds never
// look like two products. Sideways scroll in its own frame, as on the web.
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "../lib/theme";
import { InlineText } from "./Markdown";

const widthFor = (samples: string[]) => {
  const longest = samples.reduce((most, cell) => Math.max(most, cell.length), 0);
  return Math.max(72, Math.min(300, longest * 7.6 + 26));
};

const longestWord = (samples: string[]) => samples.reduce((most, cell) => Math.max(most, ...cell.split(/\s+/).map((word) => word.length)), 0);

export function DataTable({ head, rows, align, firstNames, note }: { head: string[]; rows: string[][]; align?: Array<"left" | "right" | "center">; firstNames?: boolean; note?: ReactNode }) {
  const colors = useColors();
  const [room, setRoom] = useState(0);
  const base = head.map((label, c) => widthFor([label, ...rows.map((row) => row[c] ?? "")]));
  const total = base.reduce((sum, width) => sum + width, 0);
  // as an auto-width table does: fills the frame, and past it the long columns
  // wrap first, down to a column's floor, before anything scrolls
  const floors = head.map((label, c) => Math.max(72, Math.min(120, longestWord([label, ...rows.map((row) => row[c] ?? "")]) * 7.6 + 26)));
  const floorTotal = floors.reduce((sum, width) => sum + width, 0);
  const widths = !room || room === total
    ? base
    : room > total
      ? base.map((width) => (width * room) / total)
      : room <= floorTotal
        ? floors
        : base.map((width, c) => floors[c] + ((width - floors[c]) * (room - floorTotal)) / Math.max(1, total - floorTotal));
  const side = (c: number) => (align?.[c] === "right" ? "flex-end" : align?.[c] === "center" ? "center" : "flex-start");
  return (
    <View>
      <View onLayout={(event) => setRoom(event.nativeEvent.layout.width - 2)} style={[styles.frame, { borderColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: `${colors.text}08` }]}>
              {head.map((label, c) => (
                <View key={c} style={[styles.cell, { width: widths[c], alignItems: side(c) }]}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{label}</Text>
                </View>
              ))}
            </View>
            {rows.map((row, r) => (
              <View key={r} style={[styles.row, r < rows.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                {head.map((_label, c) => (
                  <View key={c} style={[styles.cell, { width: widths[c], alignItems: side(c) }]}>
                    <InlineText text={row[c] ?? ""} size={14} weight={firstNames && c === 0 ? "500" : undefined} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {note}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row" },
  cell: { paddingHorizontal: 12, paddingVertical: 8 },
});
