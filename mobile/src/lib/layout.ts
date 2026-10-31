import { useWindowDimensions } from "react-native";

/** Past this there is room for a list beside what it opens: an iPad, or a
 * large phone is still one column at a time. */
export const SPLIT_FROM = 700;

export function useIsWide(): boolean {
  return useWindowDimensions().width >= SPLIT_FROM;
}

/** A transcript reads badly as wide as an iPad Pro, so it keeps a measure. */
export const READING_WIDTH = 820;
