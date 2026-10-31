// Charts in a generated answer (src/components/genui/charts.tsx): five fixed
// series colours, and each value written beside its mark.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { list, nodes, text } from "../lib/genui.ts";
import type { UiNode } from "../lib/messages.ts";
import { useColors } from "../lib/theme";

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${+(n / 1e3).toFixed(1)}k` : String(+n.toFixed(2)));

function Legend({ items, colors }: { items: string[]; colors: string[] }) {
  const ink = useColors();
  if (items.length < 2) return null;
  return (
    <View style={styles.legend}>
      {items.map((item, index) => (
        <View key={index} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors[index % colors.length] }]} />
          <Text style={{ color: ink.muted, fontSize: 12 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function useWidth(): [number, (event: { nativeEvent: { layout: { width: number } } }) => void] {
  const [width, setWidth] = useState(0);
  return [width, (event) => setWidth(event.nativeEvent.layout.width)];
}

const seriesOf = (node: UiNode) =>
  nodes(node.props?.series, "Series").slice(0, 5).map((item) => ({ name: text(item.props?.category), values: list(item.props?.values).map(number) }));

export function BarChart({ node }: { node: UiNode }) {
  const colors = useColors();
  const [width, onLayout] = useWidth();
  const labels = list(node.props?.labels).map(text);
  const series = seriesOf(node);
  if (!labels.length || !series.length) return null;
  const stacked = text(node.props?.variant) === "stacked";
  const height = 200;
  const bottom = 26;
  const top = 18;
  const totals = labels.map((_label, i) => series.reduce((sum, item) => sum + Math.max(0, item.values[i] ?? 0), 0));
  const peak = Math.max(1e-9, stacked ? Math.max(...totals) : Math.max(...series.flatMap((item) => item.values)));
  const scale = (value: number) => (Math.max(0, value) / peak) * (height - bottom - top);
  const slot = width / labels.length;
  const gap = Math.min(10, slot * 0.2);
  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke={colors.border} />
          {labels.map((label, i) => {
            const x = i * slot + gap / 2;
            const room = slot - gap;
            let stack = 0;
            return (
              <G key={i}>
                {series.map((item, s) => {
                  const value = item.values[i] ?? 0;
                  const h = scale(value);
                  const w = stacked ? room : room / series.length;
                  const bx = stacked ? x : x + s * w;
                  const by = height - bottom - h - stack;
                  if (stacked) stack += h;
                  return (
                    <G key={s}>
                      <Rect x={bx + 1} y={by} width={Math.max(1, w - 2)} height={h} rx={3} fill={colors.series[s]} />
                      {!stacked && w > 26 && <SvgText x={bx + w / 2} y={by - 4} fontSize={10} fill={colors.muted} textAnchor="middle">{short(value)}</SvgText>}
                    </G>
                  );
                })}
                {stacked && <SvgText x={x + room / 2} y={height - bottom - stack - 4} fontSize={10} fill={colors.muted} textAnchor="middle">{short(totals[i])}</SvgText>}
                <SvgText x={x + room / 2} y={height - 9} fontSize={11} fill={colors.muted} textAnchor="middle">{label.length * 6 > slot ? `${label.slice(0, Math.max(2, Math.floor(slot / 6.5)))}…` : label}</SvgText>
              </G>
            );
          })}
        </Svg>
      )}
      <Legend items={series.map((item) => item.name)} colors={colors.series} />
    </View>
  );
}

export function LineChart({ node }: { node: UiNode }) {
  const colors = useColors();
  const [width, onLayout] = useWidth();
  const labels = list(node.props?.labels).map(text);
  const series = seriesOf(node);
  if (!labels.length || !series.length) return null;
  const height = 200;
  const bottom = 26;
  const top = 18;
  const side = 16;
  const every = series.flatMap((item) => item.values);
  const high = Math.max(...every);
  const low = Math.min(0, ...every);
  const span = high - low || 1;
  const x = (i: number) => side + (labels.length > 1 ? (i * (width - 2 * side)) / (labels.length - 1) : (width - 2 * side) / 2);
  const y = (value: number) => top + (1 - (value - low) / span) * (height - top - bottom);
  const skip = Math.max(1, Math.ceil((labels.length * 44) / Math.max(1, width)));
  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke={colors.border} />
          {series.map((item, s) => (
            <G key={s}>
              <Polyline points={item.values.map((value, i) => `${x(i)},${y(value)}`).join(" ")} fill="none" stroke={colors.series[s]} strokeWidth={2} />
              {item.values.map((value, i) => (
                <G key={i}>
                  <Circle cx={x(i)} cy={y(value)} r={3} fill={colors.series[s]} />
                  {labels.length <= 8 && <SvgText x={x(i)} y={y(value) - 7} fontSize={10} fill={colors.muted} textAnchor="middle">{short(value)}</SvgText>}
                </G>
              ))}
            </G>
          ))}
          {labels.map((label, i) => (i % skip === 0 ? <SvgText key={i} x={x(i)} y={height - 9} fontSize={11} fill={colors.muted} textAnchor="middle">{label}</SvgText> : null))}
        </Svg>
      )}
      <Legend items={series.map((item) => item.name)} colors={colors.series} />
    </View>
  );
}

function slice(cx: number, cy: number, r: number, inner: number, from: number, to: number): string {
  const point = (radius: number, angle: number) => `${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`;
  const large = to - from > Math.PI ? 1 : 0;
  // a whole circle is drawn as just under one, since an arc cannot close on itself
  const end = to - from >= Math.PI * 2 ? to - 0.0001 : to;
  if (inner > 0) return `M ${point(r, from)} A ${r} ${r} 0 ${large} 1 ${point(r, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, from)} Z`;
  return `M ${cx} ${cy} L ${point(r, from)} A ${r} ${r} 0 ${large} 1 ${point(r, end)} Z`;
}

export function PieChart({ node }: { node: UiNode }) {
  const colors = useColors();
  const labels = list(node.props?.labels).map(text);
  const values = list(node.props?.values).map((value) => Math.max(0, number(value)));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!values.length || total <= 0) return null;
  const donut = text(node.props?.variant) !== "pie";
  const size = 160;
  let at = -Math.PI / 2;
  return (
    <View style={styles.pie}>
      <Svg width={size} height={size}>
        {values.slice(0, 5).map((value, i) => {
          const from = at;
          at += (value / total) * Math.PI * 2;
          return <Path key={i} d={slice(size / 2, size / 2, size / 2, donut ? size / 3.4 : 0, from, at)} fill={colors.series[i]} />;
        })}
      </Svg>
      <View style={styles.pieList}>
        {values.slice(0, 5).map((value, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.series[i] }]} />
            <Text style={{ color: colors.text, fontSize: 14, flexShrink: 1 }}>{labels[i] ?? ""}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{short(value)} ({Math.round((value / total) * 100)}%)</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  pie: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18 },
  pieList: { flexShrink: 1, gap: 6 },
});
