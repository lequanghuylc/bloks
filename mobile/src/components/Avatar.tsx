import { StyleSheet, Text, View } from "react-native";

const COLORS: Record<string, string> = {
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#eab308",
  green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9", blue: "#3b82f6",
  indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", gray: "#71717a",
};
const FALLBACK = Object.values(COLORS);

export function Avatar({ name, color, size = 40, square = true }: { name: string; color?: string; size?: number; square?: boolean }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const background = (color && COLORS[color]) || FALLBACK[hash % FALLBACK.length];
  return (
    <View accessibilityElementsHidden style={[styles.box, { width: size, height: size, borderRadius: square ? size * 0.28 : size / 2, backgroundColor: background }]}>
      <Text style={{ color: "#ffffff", fontSize: size * 0.42, fontWeight: "700" }}>{(name.trim()[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: "center", justifyContent: "center" } });
