// The line at the end of the transcript while an agent works
// (src/components/chat/Live.tsx): what it is doing, for how long, how to stop.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { clock, turnStartedAt, workingLineOwed, workingStep } from "../lib/chatMeta.ts";
import type { Message } from "../lib/messages.ts";
import { useColors } from "../lib/theme";

// When this screen saw each conversation start working, so coming back to one
// keeps its clock.
const seen = new Map<string, { flip: number | null; sight: number }>();
const wasWorking = new Map<string, boolean>();

function turnSince(key: string, working: boolean, said: readonly Message[]): number {
  const was = wasWorking.get(key);
  wasWorking.set(key, working);
  if (!working) {
    seen.delete(key);
    return Date.now();
  }
  let start = seen.get(key);
  if (!start) {
    const now = Date.now();
    // opened mid turn: when it began is not something this screen saw
    start = { flip: was === false ? now : null, sight: now };
    seen.set(key, start);
  }
  return Math.max(turnStartedAt(said) ?? 0, start.flip ?? 0) || start.sight;
}

export function WorkingLine({ threadKey, working, streaming, said, label, onStop }: {
  threadKey: string;
  working: boolean;
  streaming: string;
  said: readonly Message[];
  /** Who is working, in a room; an agent's own chat names the step instead. */
  label?: string;
  onStop?: () => void;
}) {
  const colors = useColors();
  const [now, setNow] = useState(() => Date.now());
  const since = turnSince(threadKey, working, said);
  const last = said[said.length - 1];
  const arrived = useRef({ id: last?.id, at: Date.now() });
  if (arrived.current.id !== last?.id) arrived.current = { id: last?.id, at: Date.now() };
  useEffect(() => {
    if (!working) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [working]);
  if (!workingLineOwed(working, streaming, last, now - arrived.current.at)) return null;
  const step = label ?? workingStep(said, streaming);
  return (
    <View style={styles.line} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.accent} />
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1 }}>{step}</Text>
      {!label && (
        <>
          <Text style={{ color: colors.muted, fontSize: 14 }}>·</Text>
          <Text style={{ color: colors.muted, fontSize: 14, fontVariant: ["tabular-nums"] }}>{clock(now - since)}</Text>
        </>
      )}
      {onStop && (
        <>
          <Text style={{ color: colors.muted, fontSize: 14 }}>·</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop the agent" hitSlop={10} onPress={onStop}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>Stop</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 16, paddingVertical: 6 },
});
