import { useColorScheme } from "react-native";

// The web's design tokens (src/styles.css), so the two read as one product.
const light = {
  background: "#ffffff",
  surface: "#f4f4f5",
  card: "#ffffff",
  secondary: "#f1f1f3",
  text: "#18181b",
  muted: "#68686f",
  border: "#e6e6e8",
  accent: "#5b6cff",
  ink: "#4a59e6",
  soft: "#eef0ff",
  onAccent: "#ffffff",
  mine: "#f1f1f3",
  onMine: "#18181b",
  danger: "#c0272d",
  success: "#1f7048",
  warning: "#8f5a09",
  code: "#f4f4f5",
  series: ["#5b6cff", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
};

export type Colors = typeof light;

const dark: Colors = {
  background: "#0e0e10",
  surface: "#1e1e23",
  card: "#17171a",
  secondary: "#232328",
  text: "#ededf0",
  muted: "#8f8f99",
  border: "#262629",
  accent: "#7c8aff",
  ink: "#7c8aff",
  soft: "#1f2133",
  onAccent: "#0e0e10",
  mine: "#232328",
  onMine: "#ededf0",
  danger: "#ff6369",
  success: "#3dd68c",
  warning: "#f5a524",
  code: "#1e1e23",
  series: ["#7282fb", "#d95926", "#199e70", "#c98500", "#d55181"],
};

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
