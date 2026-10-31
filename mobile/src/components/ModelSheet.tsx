// Choosing what an agent thinks with: every engine with its models under it,
// the one in use open. An engine that cannot be used stays in the list,
// dimmed, with the reason, as the web's picker keeps it.
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { clampEffort, EFFORTS, effortLevels, effortName, engineStatus, modelLabel, usableEngine, type Engine } from "../lib/engines.ts";
import type { ModelSelection } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { Sheet } from "./Sheet";

const FOLDED = 6;

export function ModelSheet({
  visible,
  title,
  engines,
  selection,
  effort,
  onClose,
  onPick,
  onEffort,
}: {
  visible: boolean;
  title: string;
  engines: Engine[];
  selection: ModelSelection | undefined;
  effort: string | null | undefined;
  onClose: () => void;
  onPick: (selection: ModelSelection) => void;
  onEffort: (effort: string | null) => void;
}) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [unfolded, setUnfolded] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setUnfolded([]);
    setOpen(selection ? [selection.instanceId] : []);
  }, [visible, selection?.instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ordered = useMemo(() => [...engines].sort((a, b) => {
    const rank = (engine: Engine) => (engine.instanceId === selection?.instanceId ? 0 : usableEngine(engine) ? 1 : 2);
    return rank(a) - rank(b);
  }), [engines, selection?.instanceId]);

  const current = engines.find((engine) => engine.instanceId === selection?.instanceId);
  const levels = effortLevels(current, selection?.model);
  const shownEffort = clampEffort(effort, levels);

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {levels.length > 0 && (
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.muted }]}>Reasoning effort</Text>
          <View style={styles.chips}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: !shownEffort }} onPress={() => onEffort(null)} style={[styles.chip, { backgroundColor: !shownEffort ? colors.accent : colors.surface }]}>
              <Text style={{ color: !shownEffort ? colors.onAccent : colors.text, fontSize: 14 }}>Engine's setting</Text>
            </Pressable>
            {EFFORTS.filter((level) => levels.includes(level)).map((level) => (
              <Pressable key={level} accessibilityRole="button" accessibilityState={{ selected: shownEffort === level }} onPress={() => onEffort(level)} style={[styles.chip, { backgroundColor: shownEffort === level ? colors.accent : colors.surface }]}>
                <Text style={{ color: shownEffort === level ? colors.onAccent : colors.text, fontSize: 14 }}>{effortName(level)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search models"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.search, { color: colors.text, backgroundColor: colors.surface }]}
      />
      {ordered.map((engine) => {
        const usable = usableEngine(engine);
        const options = engine.models.options.length ? engine.models.options : engine.models.default ? [{ id: engine.models.default }] : [];
        const matching = words.length
          ? options.filter((option) => words.every((word) => `${option.label ?? ""} ${option.id} ${engine.displayName}`.toLowerCase().includes(word)))
          : options;
        if (words.length && !matching.length) return null;
        const expanded = words.length > 0 || open.includes(engine.instanceId);
        const inUse = engine.instanceId === selection?.instanceId;
        const showAll = words.length > 0 || unfolded.includes(engine.instanceId);
        const chosenId = inUse ? selection?.model || engine.models.default : undefined;
        const visibleModels = showAll
          ? matching
          : [...matching.slice(0, FOLDED), ...matching.slice(FOLDED).filter((option) => option.id === chosenId)];
        return (
          <View key={engine.instanceId} style={[styles.engine, { borderColor: colors.border, opacity: usable ? 1 : 0.55 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? open.filter((id) => id !== engine.instanceId) : [...open, engine.instanceId])}
              style={styles.engineHead}
            >
              <Text numberOfLines={1} style={[styles.engineName, { color: colors.text }]}>{expanded ? "▾" : "▸"} {engine.displayName}</Text>
              <Text numberOfLines={1} style={{ color: inUse ? colors.accent : colors.muted, fontSize: 13, flexShrink: 1 }}>
                {inUse ? modelLabel(engine, selection?.model) : engineStatus(engine)}
              </Text>
            </Pressable>
            {expanded && visibleModels.map((option) => {
              const chosen = option.id === chosenId;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen, disabled: !usable }}
                  disabled={!usable}
                  onPress={() => onPick({ instanceId: engine.instanceId, model: option.id })}
                  style={[styles.model, { borderTopColor: colors.border }]}
                >
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, flex: 1, fontWeight: chosen ? "600" : "400" }}>{modelLabel(engine, option.id)}</Text>
                  {chosen && <Text style={{ color: colors.accent, fontSize: 16 }}>✓</Text>}
                </Pressable>
              );
            })}
            {expanded && !showAll && matching.length > visibleModels.length && (
              <Pressable accessibilityRole="button" onPress={() => setUnfolded([...unfolded, engine.instanceId])} style={[styles.model, { borderTopColor: colors.border }]}>
                <Text style={{ color: colors.accent, fontSize: 15 }}>Show all {matching.length}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {engines.length === 0 && <Text style={{ color: colors.muted, fontSize: 15, textAlign: "center" }}>Asking which engines this computer has…</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center" },
  search: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  engine: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden" },
  engineHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, paddingHorizontal: 14 },
  engineName: { fontSize: 16, fontWeight: "600", flexShrink: 0 },
  model: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 46, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
