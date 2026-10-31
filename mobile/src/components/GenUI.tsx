// An answer drawn as interface, from the tree the server keeps on the message
// (docs/GENERATIVE_UI.md, src/components/genui/). Every shape in the library is
// here; one this build does not know is drawn as its readable words, so a newer
// computer never blanks an older client.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Image as NativeImage, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkRules, isNode, list, nodes, opensPage, outcomesOf, speaks, startValue, text, type FieldInfo, type Rules } from "../lib/genui.ts";
import { useIsWide } from "../lib/layout";
import { safeHttpUrl } from "../lib/markdown.ts";
import type { UiEntry, UiNode, UiValue } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { DataTable } from "./DataTable";
import { BarChart, LineChart, PieChart } from "./GenCharts";
import { CodeView, InlineText, Markdown } from "./Markdown";

export interface GenUiHost {
  /** Says words back to the agent that drew this, as the person's message. */
  say: (words: string) => void;
}

interface Scope {
  host?: GenUiHost;
  state: Record<string, UiValue>;
  setState: (next: Record<string, UiValue>) => void;
  start: Record<string, UiValue>;
}

const ScopeContext = createContext<Scope>({ state: {}, setState: () => {}, start: {} });

interface FormScope {
  fields: FieldInfo[];
  values: Record<string, unknown>;
  set: (name: string, value: unknown) => void;
  errors: Record<string, string>;
  sent: boolean;
  send: (run: () => void) => void;
}

const FormContext = createContext<FormScope | null>(null);

const SAFE_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,/;

function useClick() {
  const scope = useContext(ScopeContext);
  const form = useContext(FormContext);
  const busy = useRef(false);
  return useCallback((label: string, action?: unknown) => {
    if (busy.current) return;
    busy.current = true;
    setTimeout(() => {
      busy.current = false;
    }, 1200);
    for (const outcome of outcomesOf(label, action, form?.fields, form?.values)) {
      if (outcome.kind === "say") scope.host?.say(outcome.words);
      else if (outcome.kind === "open") void Linking.openURL(outcome.url);
      else if (outcome.kind === "set") scope.setState({ ...scope.state, [outcome.name.replace(/^\$/, "$")]: outcome.value });
      else {
        const next = { ...scope.state };
        for (const name of outcome.names) if (name in scope.start) next[name] = scope.start[name];
        scope.setState(next);
      }
    }
  }, [scope, form]);
}

function Stack({ value }: { value: unknown }) {
  // metrics written one after another sit side by side
  const runs: Array<{ metrics: UiNode[] } | { one: unknown }> = [];
  for (const child of list(value)) {
    const last = runs[runs.length - 1];
    if (isNode(child) && child.type === "MetricIndicator") {
      if (last && "metrics" in last) last.metrics.push(child);
      else runs.push({ metrics: [child] });
    } else runs.push({ one: child });
  }
  return (
    <View style={styles.stack}>
      {runs.map((run, index) => (
        "metrics" in run
          ? <View key={index} style={styles.metrics}>{run.metrics.map((metric, at) => <Metric key={at} node={metric} />)}</View>
          : <Part key={index} value={run.one} />
      ))}
    </View>
  );
}

function Callout({ node }: { node: UiNode }) {
  const colors = useColors();
  const variant = text(node.props?.variant);
  const look: Record<string, { mark: string; tint: string; line: string; sign: string }> = {
    info: { mark: colors.ink, tint: colors.soft, line: `${colors.accent}33`, sign: "ⓘ" },
    warning: { mark: colors.warning, tint: `${colors.warning}0D`, line: `${colors.warning}4D`, sign: "⚠" },
    error: { mark: colors.danger, tint: `${colors.danger}0D`, line: `${colors.danger}4D`, sign: "⊘" },
    success: { mark: colors.success, tint: `${colors.success}0D`, line: `${colors.success}4D`, sign: "✓" },
    neutral: { mark: colors.muted, tint: colors.surface, line: "transparent", sign: "ⓘ" },
  };
  const chosen = look[variant] ?? look.neutral;
  const title = text(node.props?.title);
  const description = text(node.props?.description);
  if (!title && !description) return null;
  return (
    <View style={[styles.callout, { backgroundColor: chosen.tint, borderColor: chosen.line }]}>
      <Text style={{ color: chosen.mark, fontSize: 15, lineHeight: 20 }}>{chosen.sign}</Text>
      <View style={styles.flex}>
        {!!title && <Text selectable style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>{title}</Text>}
        {!!description && <InlineText text={description} color={colors.muted} size={14} />}
      </View>
    </View>
  );
}

function Pill({ label, variant }: { label: string; variant?: string }) {
  const colors = useColors();
  const look: Record<string, [string, string]> = {
    neutral: [colors.secondary, colors.text],
    info: [colors.soft, colors.ink],
    success: [`${colors.success}1A`, colors.success],
    warning: [`${colors.warning}1A`, colors.warning],
    danger: [`${colors.danger}1A`, colors.danger],
  };
  const [back, ink] = look[variant ?? "neutral"] ?? look.neutral;
  return <View style={[styles.pill, { backgroundColor: back }]}><Text style={{ color: ink, fontSize: 12, fontWeight: "500" }}>{label}</Text></View>;
}

function Metric({ node }: { node: UiNode }) {
  const colors = useColors();
  const label = text(node.props?.label);
  const value = text(node.props?.value);
  if (!label && !value) return null;
  const trend = text(node.props?.trend);
  const tone = text(node.props?.tone) || (trend === "up" ? "positive" : trend === "down" ? "negative" : "neutral");
  const change = text(node.props?.change);
  const ink = tone === "positive" ? colors.success : tone === "negative" ? colors.danger : colors.muted;
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 20, fontWeight: "600", marginTop: 2 }}>{value}</Text>
      {!!change && <Text numberOfLines={1} style={{ color: ink, fontSize: 13, fontWeight: "500", marginTop: 2 }}>{trend === "up" ? "↑ " : trend === "down" ? "↓ " : ""}{change}</Text>}
    </View>
  );
}

const cellWords = (value: unknown) => (typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "number" ? (Number.isFinite(value) ? value.toLocaleString() : "") : text(value));

function GenTable({ node }: { node: UiNode }) {
  const colors = useColors();
  const columns = nodes(node.props?.columns, "Col").map((col) => {
    const data = list(col.props?.data);
    return {
      label: text(col.props?.label),
      data,
      numeric: text(col.props?.type) === "number" || (data.length > 0 && data.every((value) => value === null || typeof value === "number")),
    };
  });
  if (!columns.length) return null;
  const count = Math.max(0, ...columns.map((col) => col.data.length));
  const shown = Math.min(count, 200);
  return (
    <DataTable
      head={columns.map((col) => col.label)}
      align={columns.map((col) => (col.numeric ? "right" : "left"))}
      firstNames={columns[0].label === ""}
      rows={Array.from({ length: shown }, (_row, r) => columns.map((col) => cellWords(col.data[r])))}
      note={count > shown ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>{count - shown} more rows not shown</Text> : null}
    />
  );
}

function StepMark({ state, index }: { state: string; index: number }) {
  const colors = useColors();
  const look: Record<string, [string, string, string]> = {
    done: [`${colors.success}1F`, colors.success, "✓"],
    doing: [colors.soft, colors.ink, "◉"],
    failed: [`${colors.danger}1A`, colors.danger, "✕"],
  };
  const [back, ink, sign] = look[state] ?? (state === "todo" ? ["transparent", colors.muted, String(index + 1)] : [colors.secondary, colors.text, String(index + 1)]);
  return (
    <View style={[styles.stepMark, { backgroundColor: back }, state === "todo" && { borderWidth: 1, borderColor: colors.border }]}>
      <Text style={{ color: ink, fontSize: 11, fontWeight: "600" }}>{sign}</Text>
    </View>
  );
}

function Steps({ node }: { node: UiNode }) {
  const colors = useColors();
  const items = nodes(node.props?.items, "StepsItem");
  if (!items.length) return null;
  return (
    <View>
      {items.map((item, index) => {
        const state = text(item.props?.state);
        const details = text(item.props?.details);
        return (
          <View key={index} style={styles.step}>
            <View style={styles.stepRail}>
              <StepMark state={state} index={index} />
              {index < items.length - 1 && <View style={[styles.stepLine, { backgroundColor: colors.border }]} />}
            </View>
            <View style={[styles.flex, index < items.length - 1 && { paddingBottom: 12 }]}>
              <Text selectable style={{ color: state === "todo" ? colors.muted : colors.text, fontSize: 14, lineHeight: 20, fontWeight: "500" }}>{text(item.props?.title)}</Text>
              {!!details && <InlineText text={details} color={colors.muted} size={13} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function GenList({ node }: { node: UiNode }) {
  const colors = useColors();
  const click = useClick();
  const items = nodes(node.props?.items, "ListItem");
  if (!items.length) return null;
  const numbered = text(node.props?.variant) === "number";
  return (
    <View style={[styles.frame, { borderColor: colors.border }]}>
      {items.map((item, index) => {
        const title = text(item.props?.title);
        const subtitle = text(item.props?.subtitle);
        const action = item.props?.action;
        const src = text((item.props?.image as { src?: unknown } | undefined)?.src);
        const body = (
          <>
            {numbered && <Text style={{ color: colors.muted, fontSize: 13, width: 20 }}>{index + 1}</Text>}
            {SAFE_IMAGE.test(src) && <NativeImage source={{ uri: src }} style={styles.thumb} />}
            <View style={styles.flex}>
              <Text selectable style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{title}</Text>
              {!!subtitle && <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{subtitle}</Text>}
            </View>
            {!!action && <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "500" }}>{text(item.props?.actionLabel)} {opensPage(action) ? "↗" : "›"}</Text>}
          </>
        );
        const line = index < items.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : undefined;
        return action
          ? <Pressable key={index} accessibilityRole="button" onPress={() => click(title, action)} style={({ pressed }) => [styles.listRow, line, pressed && { backgroundColor: colors.surface }]}>{body}</Pressable>
          : <View key={index} style={[styles.listRow, line]}>{body}</View>;
      })}
    </View>
  );
}

function OptionCards({ node }: { node: UiNode }) {
  const colors = useColors();
  const wide = useIsWide();
  const click = useClick();
  const [chosen, setChosen] = useState<number | null>(null);
  const items = nodes(node.props?.items, "OptionCard");
  if (!items.length) return null;
  const title = text(node.props?.title);
  const note = text(node.props?.note);
  const recommended = items.findIndex((item) => item.props?.recommended === true);
  return (
    <View style={styles.gap8}>
      {!!title && <Text selectable style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>{title}</Text>}
      <View style={styles.options}>
        {items.map((item, index) => {
          const picked = chosen === index;
          const label = text(item.props?.title);
          const subtitle = text(item.props?.subtitle);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityState={{ selected: picked, disabled: chosen !== null }}
              disabled={chosen !== null}
              onPress={() => {
                setChosen(index);
                click(label);
              }}
              style={({ pressed }) => [
                styles.option,
                wide ? styles.optionHalf : styles.optionWhole,
                {
                  borderColor: picked ? colors.ink : index === recommended && chosen === null ? `${colors.accent}73` : colors.border,
                  backgroundColor: picked ? colors.soft : pressed ? colors.surface : "transparent",
                  opacity: chosen !== null && !picked ? 0.55 : 1,
                },
              ]}
            >
              <View style={styles.optionHead}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>{label}</Text>
                {picked
                  ? <Text style={{ color: colors.ink, fontSize: 14 }}>✓</Text>
                  : index === recommended
                    ? <View style={[styles.recommended, { backgroundColor: colors.soft }]}><Text style={{ color: colors.ink, fontSize: 11, fontWeight: "500" }}>Recommended</Text></View>
                    : null}
              </View>
              {!!subtitle && <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text>}
            </Pressable>
          );
        })}
      </View>
      {!!note && <Text style={{ color: colors.muted, fontSize: 13 }}>{note}</Text>}
    </View>
  );
}

function Sources({ node }: { node: UiNode }) {
  const colors = useColors();
  const items = list(node.props?.items).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  if (!items.length) return null;
  return (
    <View style={[styles.sources, { borderTopColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "500" }}>Sources</Text>
      {items.map((source, index) => {
        const url = safeHttpUrl(source.url);
        const host = url ? url.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "") : "";
        const row = (
          <>
            <Text style={{ color: colors.muted, fontSize: 13, width: 16 }}>{index + 1}</Text>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, flex: 1 }}>{text(source.title) || host || "Source"}</Text>
            {!!(text(source.sourceName) || host) && <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, maxWidth: "40%" }}>{text(source.sourceName) || host}</Text>}
          </>
        );
        return url
          ? <Pressable key={index} accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={styles.sourceRow}>{row}</Pressable>
          : <View key={index} style={styles.sourceRow}>{row}</View>;
      })}
    </View>
  );
}

function Tabs({ node }: { node: UiNode }) {
  const colors = useColors();
  const [open, setOpen] = useState(0);
  const items = nodes(node.props?.items, "TabItem");
  if (!items.length) return null;
  const at = open < items.length ? open : 0;
  return (
    <View style={styles.gap12}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { backgroundColor: colors.surface }]} contentContainerStyle={styles.tabsBody}>
        {items.map((item, index) => (
          <Pressable key={index} accessibilityRole="tab" accessibilityState={{ selected: index === at }} onPress={() => setOpen(index)} style={[styles.tab, index === at && { backgroundColor: colors.background }]}>
            <Text style={{ color: index === at ? colors.text : colors.muted, fontSize: 14, fontWeight: "500" }}>{text(item.props?.trigger) || `Tab ${index + 1}`}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Stack value={items[at].props?.content} />
    </View>
  );
}

function AccordionRow({ item, last }: { item: UiNode; last: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={!last ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : undefined}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.accordionHead}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", flex: 1 }}>{text(item.props?.trigger)}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open && <View style={styles.accordionBody}><Stack value={item.props?.content} /></View>}
    </View>
  );
}

function GenButton({ node }: { node: UiNode }) {
  const colors = useColors();
  const click = useClick();
  const form = useContext(FormContext);
  const label = text(node.props?.label);
  if (!label) return null;
  const action = node.props?.action;
  const variant = text(node.props?.variant) || (form ? "primary" : "secondary");
  const says = speaks(action);
  const off = Boolean(form?.sent && says);
  const back = variant === "primary" ? colors.accent : "transparent";
  const ink = variant === "primary" ? colors.onAccent : variant === "tertiary" ? colors.muted : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => {
        if (form && says) form.send(() => click(label, action));
        else click(label, action);
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: back, borderColor: variant === "secondary" ? colors.border : "transparent", opacity: off ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <Text style={{ color: ink, fontSize: 14, fontWeight: "500" }}>{label}{opensPage(action) ? " ↗" : ""}</Text>
    </Pressable>
  );
}

function FollowUps({ node }: { node: UiNode }) {
  const colors = useColors();
  const click = useClick();
  const items = nodes(node.props?.items, "FollowUpItem").map((item) => text(item.props?.text)).filter(Boolean);
  if (!items.length) return null;
  return (
    <View style={[styles.followUps, { borderTopColor: colors.border }]}>
      {items.map((question, index) => (
        <Pressable key={index} accessibilityRole="button" onPress={() => click(question)} style={({ pressed }) => [styles.followUp, pressed && { backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>↳</Text>
          <Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{question}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function fieldsOf(form: UiNode): FieldInfo[] {
  return nodes(form.props?.fields, "FormControl").flatMap((control) => {
    const input = control.props?.input;
    if (!isNode(input)) return [];
    return [{ name: text(input.props?.name), label: text(control.props?.label), input }];
  });
}

function GenForm({ node }: { node: UiNode }) {
  const colors = useColors();
  const scope = useContext(ScopeContext);
  const fields = useMemo(() => fieldsOf(node), [node]);
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map((field) => [field.name, startValue(field.input, scope.state)])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const value: FormScope = {
    fields,
    values,
    errors,
    sent,
    set: (name, next) => {
      setValues((current) => ({ ...current, [name]: next }));
      setErrors((current) => {
        const { [name]: _gone, ...rest } = current;
        return rest;
      });
    },
    send: (run) => {
      const found: Record<string, string> = {};
      for (const field of fields) {
        const wrong = checkRules(field.input.props?.rules as Rules | undefined, values[field.name]);
        if (wrong) found[field.name] = wrong;
      }
      setErrors(found);
      if (Object.keys(found).length) return;
      run();
      setSent(true);
    },
  };
  return (
    <FormContext.Provider value={value}>
      <View style={styles.gap12}>
        {nodes(node.props?.fields, "FormControl").map((control, index) => {
          const input = control.props?.input;
          if (!isNode(input)) return null;
          const name = text(input.props?.name);
          const hint = text(control.props?.hint);
          return (
            <View key={index} style={styles.gap6}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>{text(control.props?.label)}</Text>
              <Field input={input} />
              {!!errors[name] && <Text style={{ color: colors.danger, fontSize: 13 }}>{errors[name]}</Text>}
              {!!hint && <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text>}
            </View>
          );
        })}
        {isNode(node.props?.buttons) && <Part value={node.props?.buttons} />}
        {sent && <Text style={{ color: colors.muted, fontSize: 13 }}>Sent</Text>}
      </View>
    </FormContext.Provider>
  );
}

function Tick({ on, round }: { on: boolean; round?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.tick, round && styles.tickRound, { borderColor: on ? colors.accent : colors.muted, backgroundColor: on ? colors.accent : "transparent" }]}>
      {on && <Text style={{ color: colors.onAccent, fontSize: 11, lineHeight: 13 }}>{round ? "●" : "✓"}</Text>}
    </View>
  );
}

function Field({ input }: { input: UiNode }) {
  const colors = useColors();
  const form = useContext(FormContext);
  const [open, setOpen] = useState(false);
  if (!form) return null;
  const props = input.props ?? {};
  const name = text(props.name);
  const value = form.values[name];
  const locked = form.sent;
  const box = [styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: form.errors[name] ? colors.danger : colors.border, opacity: locked ? 0.6 : 1 }];
  switch (input.type) {
    case "Input": {
      const type = text(props.type);
      return (
        <TextInput
          accessibilityLabel={name}
          editable={!locked}
          value={typeof value === "string" ? value : ""}
          onChangeText={(next) => form.set(name, next)}
          placeholder={text(props.placeholder)}
          placeholderTextColor={colors.muted}
          autoCapitalize={type === "text" || !type ? "sentences" : "none"}
          keyboardType={type === "email" ? "email-address" : type === "number" ? "numeric" : type === "url" ? "url" : "default"}
          style={box}
        />
      );
    }
    case "TextArea":
      return (
        <TextInput
          accessibilityLabel={name}
          editable={!locked}
          multiline
          value={typeof value === "string" ? value : ""}
          onChangeText={(next) => form.set(name, next)}
          placeholder={text(props.placeholder)}
          placeholderTextColor={colors.muted}
          style={[box, { minHeight: Math.max(2, typeof props.rows === "number" ? props.rows : 3) * 22, textAlignVertical: "top", paddingTop: 10 }]}
        />
      );
    case "Select": {
      const items = nodes(props.items, "SelectItem");
      const chosen = items.find((item) => item.props?.value === value);
      return (
        <View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={locked} onPress={() => setOpen(!open)} style={[box, styles.select]}>
            <Text style={{ color: chosen ? colors.text : colors.muted, fontSize: 15, flex: 1 }}>{chosen ? text(chosen.props?.label) : text(props.placeholder) || "Choose"}</Text>
            <Text style={{ color: colors.muted }}>{open ? "⌃" : "⌄"}</Text>
          </Pressable>
          {open && items.map((item, index) => (
            <Pressable key={index} accessibilityRole="button" onPress={() => { form.set(name, item.props?.value); setOpen(false); }} style={[styles.selectRow, { borderBottomColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{text(item.props?.label)}</Text>
              {item.props?.value === value && <Text style={{ color: colors.ink }}>✓</Text>}
            </Pressable>
          ))}
        </View>
      );
    }
    case "RadioGroup":
      return (
        <View style={styles.gap8}>
          {nodes(props.items, "RadioItem").map((item, index) => (
            <Pressable key={index} accessibilityRole="radio" accessibilityState={{ checked: item.props?.value === value }} disabled={locked} onPress={() => form.set(name, item.props?.value)} style={styles.tickRow}>
              <Tick on={item.props?.value === value} round />
              <View style={styles.flex}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{text(item.props?.label)}</Text>
                {!!text(item.props?.description) && <Text style={{ color: colors.muted, fontSize: 13 }}>{text(item.props?.description)}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      );
    case "CheckBoxGroup": {
      const ticks = (value ?? {}) as Record<string, boolean>;
      return (
        <View style={styles.gap8}>
          {nodes(props.items, "CheckBoxItem").map((item, index) => {
            const key = text(item.props?.name);
            return (
              <Pressable key={index} accessibilityRole="checkbox" accessibilityState={{ checked: ticks[key] === true }} disabled={locked} onPress={() => form.set(name, { ...ticks, [key]: !ticks[key] })} style={styles.tickRow}>
                <Tick on={ticks[key] === true} />
                <View style={styles.flex}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{text(item.props?.label)}</Text>
                  {!!text(item.props?.description) && <Text style={{ color: colors.muted, fontSize: 13 }}>{text(item.props?.description)}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      );
    }
    case "Slider": {
      const min = typeof props.min === "number" ? props.min : 0;
      const max = typeof props.max === "number" ? props.max : 100;
      const step = typeof props.step === "number" && props.step > 0 ? props.step : Math.max((max - min) / 20, 1);
      const current = Array.isArray(value) && typeof value[0] === "number" ? value[0] : min;
      const move = (by: number) => form.set(name, [Math.min(max, Math.max(min, +(current + by).toFixed(6)))]);
      return (
        <View style={styles.slider}>
          <Pressable accessibilityRole="button" accessibilityLabel="Less" disabled={locked} onPress={() => move(-step)} style={[styles.stepper, { borderColor: colors.border }]}><Text style={{ color: colors.text, fontSize: 18 }}>−</Text></Pressable>
          <View style={styles.flex}>
            <Text style={{ color: colors.text, fontSize: 14, textAlign: "center" }}>{text(props.label) ? `${text(props.label)}: ` : ""}{current}</Text>
            <View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.trackFill, { width: `${((current - min) / (max - min || 1)) * 100}%`, backgroundColor: colors.accent }]} /></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={locked} onPress={() => move(step)} style={[styles.stepper, { borderColor: colors.border }]}><Text style={{ color: colors.text, fontSize: 18 }}>+</Text></Pressable>
        </View>
      );
    }
    case "DatePicker": {
      if (text(props.mode) === "range") {
        const pair = Array.isArray(value) ? (value as string[]) : ["", ""];
        return (
          <View style={styles.slider}>
            {[0, 1].map((at) => (
              <TextInput key={at} accessibilityLabel={at ? "To" : "From"} editable={!locked} value={pair[at] ?? ""} onChangeText={(next) => form.set(name, at ? [pair[0], next] : [next, pair[1]])} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" style={[box, styles.flex]} />
            ))}
          </View>
        );
      }
      return <TextInput accessibilityLabel={name} editable={!locked} value={typeof value === "string" ? value : ""} onChangeText={(next) => form.set(name, next)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" style={box} />;
    }
    default:
      return null;
  }
}

/** The words in a shape this build does not know. */
function wordsIn(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(wordsIn);
  if (isNode(value)) return Object.values(value.props ?? {}).flatMap(wordsIn);
  return [];
}

function Part({ value }: { value: unknown }): ReactNode {
  const colors = useColors();
  if (!isNode(value)) return null;
  const props = value.props ?? {};
  switch (value.type) {
    case "Card":
      return <Stack value={props.children} />;
    case "CardHeader": {
      const title = text(props.title);
      const subtitle = text(props.subtitle);
      if (!title && !subtitle) return null;
      return (
        <View>
          {!!title && <Text selectable style={{ color: colors.text, fontSize: 17, lineHeight: 24, fontWeight: "600" }}>{title}</Text>}
          {!!subtitle && <Text selectable style={{ color: colors.muted, fontSize: 14, marginTop: 2 }}>{subtitle}</Text>}
        </View>
      );
    }
    case "TextContent": {
      const words = text(props.text);
      if (!words) return null;
      const size = text(props.size);
      if (size === "large" || size === "large-heavy") return <InlineText text={words} size={17} weight={size === "large-heavy" ? "600" : undefined} />;
      if (size === "small" || size === "small-heavy") return <InlineText text={words} size={14} weight={size === "small-heavy" ? "600" : undefined} />;
      return <Markdown text={words} />;
    }
    case "Callout":
      return <Callout node={value} />;
    case "Separator":
      return <View style={[styles.separator, { backgroundColor: colors.border }]} />;
    case "Image": {
      const alt = text(props.alt);
      const src = text(props.src);
      if (SAFE_IMAGE.test(src)) return <NativeImage accessibilityLabel={alt} source={{ uri: src }} resizeMode="contain" style={[styles.image, { borderColor: colors.border }]} />;
      // an address an agent wrote is offered, never fetched
      const url = safeHttpUrl(src);
      if (!url) return null;
      return (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={[styles.imageLink, { borderColor: colors.border }]}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14, flex: 1 }}>{alt || "Image"}</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{url.replace(/^https?:\/\//i, "").split("/")[0]} ↗</Text>
        </Pressable>
      );
    }
    case "CodeBlock": {
      const code = text(props.codeString);
      return code ? <CodeView lang={text(props.language)} code={code} /> : null;
    }
    case "Quote": {
      const words = text(props.text);
      if (!words) return null;
      const said = [text(props.from), text(props.where)].filter(Boolean).join(" · ");
      return (
        <View style={[styles.genQuote, { borderLeftColor: colors.accent }]}>
          <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{words}</Text>
          {!!said && <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>{said}</Text>}
        </View>
      );
    }
    case "Tag":
      return text(props.text) ? <View style={styles.tags}><Pill label={text(props.text)} variant={text(props.variant)} /></View> : null;
    case "TagBlock": {
      const tags = list(props.tags).map(text).filter(Boolean);
      return tags.length ? <View style={styles.tags}>{tags.map((tag, index) => <Pill key={index} label={tag} />)}</View> : null;
    }
    case "MetricIndicator":
      return <View style={styles.metrics}><Metric node={value} /></View>;
    case "Table":
      return <GenTable node={value} />;
    case "BarChart":
      return <BarChart node={value} />;
    case "LineChart":
      return <LineChart node={value} />;
    case "PieChart":
      return <PieChart node={value} />;
    case "Steps":
      return <Steps node={value} />;
    case "ListBlock":
      return <GenList node={value} />;
    case "OptionCards":
      return <OptionCards node={value} />;
    case "Sources":
      return <Sources node={value} />;
    case "Tabs":
      return <Tabs node={value} />;
    case "Accordion": {
      const items = nodes(props.items, "AccordionItem");
      if (!items.length) return null;
      return <View style={[styles.frame, { borderColor: colors.border }]}>{items.map((item, index) => <AccordionRow key={index} item={item} last={index === items.length - 1} />)}</View>;
    }
    case "Button":
      return <View style={styles.buttons}><GenButton node={value} /></View>;
    case "Buttons": {
      const buttons = nodes(props.buttons, "Button");
      if (!buttons.length) return null;
      return <View style={text(props.direction) === "column" ? styles.buttonsColumn : styles.buttons}>{buttons.map((button, index) => <GenButton key={index} node={button} />)}</View>;
    }
    case "FollowUpBlock":
      return <FollowUps node={value} />;
    case "Form":
      return <GenForm node={value} />;
    default: {
      const words = wordsIn(value);
      return words.length ? <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{words.join("\n")}</Text> : null;
    }
  }
}

export function GenUI({ entry, host }: { entry: UiEntry; host?: GenUiHost }) {
  const colors = useColors();
  const [state, setState] = useState<Record<string, UiValue>>(entry.state ?? {});
  const scope = useMemo(() => ({ host, state, setState, start: entry.state ?? {} }), [host, state, entry.state]);
  return (
    <ScopeContext.Provider value={scope}>
      <View style={styles.gap8}>
        <Part value={entry.tree} />
        {entry.truncated && <Text style={{ color: colors.muted, fontSize: 13 }}>Part of this answer was too long to show.</Text>}
      </View>
    </ScopeContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flexGrow: 1, flexBasis: 152, minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  callout: { flexDirection: "row", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  image: { width: "100%", height: 280, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  imageLink: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  genQuote: { borderLeftWidth: 2, paddingLeft: 16 },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center" },
  stepMark: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepLine: { width: StyleSheet.hairlineWidth, flex: 1, marginVertical: 2 },
  frame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  thumb: { width: 36, height: 36, borderRadius: 8 },
  options: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  option: { gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  optionHalf: { width: "49%" },
  optionWhole: { width: "100%" },
  optionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  recommended: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  sources: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  sourceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 4 },
  tabs: { borderRadius: 10, flexGrow: 0 },
  tabsBody: { flexGrow: 1, padding: 2, gap: 2 },
  tab: { flexGrow: 1, alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  accordionHead: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14 },
  accordionBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  buttons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  buttonsColumn: { alignItems: "flex-start", gap: 8 },
  button: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  followUps: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  followUp: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, borderRadius: 8, paddingHorizontal: 2 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 15 },
  select: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectRow: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tickRow: { flexDirection: "row", gap: 10, minHeight: 28 },
  tick: { width: 18, height: 18, marginTop: 1, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tickRound: { borderRadius: 9 },
  slider: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepper: { width: 40, height: 40, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  track: { height: 4, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  trackFill: { height: 4 },
});
