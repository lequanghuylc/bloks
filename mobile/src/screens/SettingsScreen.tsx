// Settings for one instance, in the groups the web uses (AppSettingsPanel):
// the pages that make sense from a phone are here, side by side with their
// list on a wide screen and pushed on a narrow one. The rest are named at the
// foot, so nobody wonders where they went.
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { ModelSheet } from "../components/ModelSheet";
import { transportOf } from "../lib/address.ts";
import { useThemeChoice, type ThemeChoice } from "../lib/appearance";
import { engineStatus, modelLabel, planRows, selectionLabel, effortName, type Engine, type PlanUsage } from "../lib/engines.ts";
import { useInstances } from "../lib/instances";
import { useIsWide } from "../lib/layout";
import type { Bot, ModelSelection } from "../lib/messages.ts";
import type { ScreenProps } from "../lib/routes";
import { useColors } from "../lib/theme";
import { useLiveWorkspace } from "../lib/workspaceContext";

type Config = Record<string, any>;
type Save = (patch: Config) => void;

const PAGES = [
  { id: "connection", group: "This device", label: "Connection" },
  { id: "general", group: "Account", label: "General" },
  { id: "about-you", group: "Account", label: "About you" },
  { id: "engines", group: "Agents", label: "Engines" },
  { id: "agents", group: "Agents", label: "Agent settings" },
  { id: "new-agents", group: "Agents", label: "New agents" },
  { id: "behaviour", group: "Agents", label: "Behaviour" },
  { id: "devices", group: "Connections", label: "Phone and devices" },
  { id: "about", group: "Help", label: "About" },
] as const;

export type SettingsPageId = (typeof PAGES)[number]["id"];

const COMPUTER_ONLY = "Plan, rules and approvals, security, voices, plugins, apps, chat and email, home, computers, browser, past sessions, bringing your setup, record, backups and training.";

function Group({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      {!!title && <Text style={[styles.groupTitle, { color: colors.muted }]}>{title}</Text>}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
      {!!note && <Text style={[styles.note, { color: colors.muted }]}>{note}</Text>}
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.rowWords}>
        <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
        {!!hint && <Text style={[styles.note, { color: colors.muted }]}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <Row label={label}>
      <Text selectable numberOfLines={2} style={{ color: colors.muted, fontSize: 15, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </Row>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </Row>
  );
}

function Choice<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: Array<{ value: T; label: string }>; onChange: (next: T) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.choice, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
      {!!hint && <Text style={[styles.note, { color: colors.muted }]}>{hint}</Text>}
      <View style={styles.chips}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(option.value)} style={[styles.chip, { backgroundColor: on ? colors.accent : colors.background }]}>
              <Text style={{ color: on ? colors.onAccent : colors.text, fontSize: 14 }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Link({ label, value, onPress, danger }: { label: string; value?: string; onPress: () => void; danger?: boolean }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 16, flexShrink: 0 }}>{label}</Text>
      {!!value && <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 15, flexShrink: 1 }}>{value}</Text>}
    </Pressable>
  );
}

/** Text saved when it is pressed, not on every key. */
function Words({ label, hint, saved, multiline, onSave }: { label: string; hint?: string; saved: string; multiline?: boolean; onSave: (next: string) => void }) {
  const colors = useColors();
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const changed = draft !== saved;
  return (
    <View style={[styles.choice, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 16 }}>{label}</Text>
      {!!hint && <Text style={[styles.note, { color: colors.muted }]}>{hint}</Text>}
      <TextInput
        accessibilityLabel={label}
        value={draft}
        onChangeText={setDraft}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.inputTall, { color: colors.text, backgroundColor: colors.background }]}
      />
      {changed && (
        <Pressable accessibilityRole="button" onPress={() => onSave(draft)} style={[styles.save, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.onAccent, fontSize: 15, fontWeight: "600" }}>Save</Text>
        </Pressable>
      )}
    </View>
  );
}

function BehaviourPage({ config, save }: { config: Config; save: Save }) {
  const beforeTurn = config.compaction?.beforeTurn ?? 0;
  return (
    <>
      <Group title="Skills and memory">
        <Choice label="Learn skills" value={config.skills?.learn ?? "off"} options={[{ value: "off", label: "Off" }, { value: "suggest", label: "Suggest" }, { value: "more", label: "More" }]} onChange={(learn) => save({ skills: { learn } })} />
        <Toggle label="Suggest skills" value={Boolean(config.skills?.propose)} onChange={(propose) => save({ skills: { propose } })} />
        <Toggle label="Bring up other conversations" value={Boolean(config.recall?.beforeTurn)} onChange={(on) => save({ recall: { beforeTurn: on } })} />
        <Toggle label="Tidy memory every night" value={Boolean(config.memory?.tidy)} onChange={(tidy) => save({ memory: { tidy } })} />
      </Group>
      <Group title="While an agent works">
        <Choice label="Messages while an agent works" value={config.delivery?.mode ?? "auto"} options={[{ value: "auto", label: "Auto" }, { value: "interrupt", label: "Interrupt" }, { value: "queue", label: "Queue" }]} onChange={(mode) => save({ delivery: { mode } })} />
        <Choice label="Agent to agent limit" hint="Most agent replies in a row." value={config.agents?.turnLimit ?? 50} options={[5, 10, 20, 50].map((value) => ({ value, label: String(value) }))} onChange={(turnLimit) => save({ agents: { turnLimit } })} />
        <Choice label="Stop stuck tool calls" value={config.turns?.stallMinutes ?? 15} options={[{ value: 5, label: "5 min" }, { value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 60, label: "1 hour" }, { value: 0, label: "Never" }]} onChange={(stallMinutes) => save({ turns: { stallMinutes } })} />
        <Choice label="Background work an agent starts" value={config.turns?.backgroundWork ?? "finish"} options={[{ value: "finish", label: "Let it finish" }, { value: "stop", label: "Stop it" }]} onChange={(backgroundWork) => save({ turns: { backgroundWork } })} />
        <Toggle label="Show others' changed files" value={Boolean(config.changes?.showShared)} onChange={(showShared) => save({ changes: { showShared } })} />
        <Toggle label="Incident desk" value={Boolean(config.incidents?.enabled)} onChange={(enabled) => save({ incidents: { enabled } })} />
      </Group>
      <Group title="Long chats">
        <Choice label="Compact long chats" value={[100000, 200000, 400000, 0].includes(beforeTurn) ? beforeTurn : 200000} options={[{ value: 100000, label: "100k" }, { value: 200000, label: "200k" }, { value: 400000, label: "400k" }, { value: 0, label: "Never" }]} onChange={(next) => save({ compaction: { beforeTurn: next } })} />
        <Toggle label="Summarise as you go" value={Boolean(config.compaction?.micro)} onChange={(micro) => save({ compaction: { micro } })} />
        <Toggle label="Compact while idle" value={Boolean(config.compaction?.idle)} onChange={(idle) => save({ compaction: { idle } })} />
      </Group>
    </>
  );
}

function NewAgentsPage({ config, save, engines }: { config: Config; save: Save; engines: Engine[] }) {
  const [open, setOpen] = useState(false);
  const defaults = config.agentDefaults ?? {};
  const selection: ModelSelection | undefined = defaults.modelSelection;
  const put = (patch: Config) => save({ agentDefaults: { ...defaults, ...patch } });
  return (
    <Group title="Where a new agent starts" note="Approvals are changed on your computer, in Rules and approvals.">
      <Link label="Model" value={`${selectionLabel(engines, selection)}${defaults.effort ? ` · ${effortName(defaults.effort)}` : ""}`} onPress={() => setOpen(true)} />
      <Value label="Approvals" value={defaults.approvals ?? "ask"} />
      <Words label="Working folder" hint="On that computer." saved={defaults.cwd ?? ""} onSave={(cwd) => put({ cwd: cwd.trim() || undefined })} />
      <ModelSheet
        visible={open}
        title="New agents' model"
        engines={engines}
        selection={selection}
        effort={defaults.effort}
        onClose={() => setOpen(false)}
        onPick={(modelSelection) => put({ modelSelection })}
        onEffort={(effort) => put({ effort: effort ?? undefined })}
      />
    </Group>
  );
}

function AgentPage({ bot, engines, patch, onBack }: { bot: Bot; engines: Engine[]; patch: (id: string, change: Config) => void; onBack: () => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={{ color: colors.accent, fontSize: 16 }}>‹ All agents</Text>
      </Pressable>
      <Group title={bot.name}>
        <Words label="Name" saved={bot.name} onSave={(name) => patch(bot.id, { name })} />
        <Words label="Title" saved={bot.title ?? ""} onSave={(title) => patch(bot.id, { title })} />
        <Link label="Model" value={`${selectionLabel(engines, bot.modelSelection)}${bot.effort ? ` · ${effortName(bot.effort)}` : ""}`} onPress={() => setOpen(true)} />
        <Toggle label="Notify me when it replies" value={bot.notifications !== false} onChange={(notifications) => patch(bot.id, { notifications })} />
      </Group>
      <Group note="Giving an agent more freedom needs confirming at the computer, so this is changed there.">
        <Value label="How much it asks" value={bot.approvals ?? "ask"} />
      </Group>
      <ModelSheet
        visible={open}
        title={`${bot.name}'s model`}
        engines={engines}
        selection={bot.modelSelection}
        effort={bot.effort}
        onClose={() => setOpen(false)}
        onPick={(modelSelection) => patch(bot.id, { modelSelection })}
        onEffort={(effort) => patch(bot.id, { effort })}
      />
    </>
  );
}

function EnginesPage({ engines, plans }: { engines: Engine[]; plans: Record<string, PlanUsage> }) {
  const colors = useColors();
  return (
    <>
      {engines.map((engine) => {
        const rows = planRows(plans[engine.instanceId], Date.now());
        return (
          <Group key={engine.instanceId} title={engine.displayName}>
            <Value label="Status" value={engineStatus(engine)} />
            {!!engine.snapshot?.version && <Value label="Version" value={engine.snapshot.version} />}
            <Value label="Default model" value={modelLabel(engine, engine.models.default)} />
            {rows.map((row) => (
              <Row key={row.id} label={row.label} hint={row.note ?? undefined}>
                <Text style={{ color: row.near ? colors.warning : colors.muted, fontSize: 15 }}>{row.used}</Text>
              </Row>
            ))}
          </Group>
        );
      })}
      <Text style={[styles.note, { color: colors.muted }]}>Sign in to an engine or add keys on the computer.</Text>
    </>
  );
}

function DevicesPage({ client }: { client: NonNullable<ReturnType<ReturnType<typeof useInstances>["clientFor"]>> }) {
  const colors = useColors();
  const [state, setState] = useState<{ devices: Array<{ id: string; name: string; client?: string; lastSeen?: number }>; thisDevice?: string; computer?: string; listening?: string; addresses?: string[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    client.request("/api/pair").then(setState, (err) => setError(err instanceof Error ? err.message : String(err)));
  }, [client]);
  useEffect(load, [load]);
  if (error) return <Text style={[styles.note, { color: colors.danger }]}>{error}</Text>;
  if (!state) return <ActivityIndicator />;
  const remove = (id: string, name: string) => {
    Alert.alert(`Remove ${name}?`, "It will have to pair again to reach this computer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => client.request(`/api/pair/devices/${id}`, { method: "DELETE" }).then(load, (err) => setError(err instanceof Error ? err.message : String(err))) },
    ]);
  };
  return (
    <>
      <Group title={state.computer ?? "This computer"}>
        <Value label="Listening on" value={state.listening === "network" ? "Your network" : "This computer only"} />
        {!!state.addresses?.length && <Value label="Addresses" value={state.addresses.join(", ")} />}
      </Group>
      <Group title="Paired devices" note="Pair a new one from Settings on the computer.">
        {state.devices.length === 0 && <Value label="None yet" value="" />}
        {state.devices.map((device) => device.id === state.thisDevice
          ? <Value key={device.id} label={device.name} value="This device" />
          : <Link key={device.id} label={device.name} value={device.client ?? "Remove"} onPress={() => remove(device.id, device.name)} />)}
      </Group>
    </>
  );
}

export function SettingsScreen({ navigation, route }: ScreenProps<"Settings">) {
  const { instanceId, page: pushed } = route.params;
  const colors = useColors();
  const wide = useIsWide();
  const { instances, clientFor, update, remove } = useInstances();
  const instance = instances.find((item) => item.id === instanceId);
  const client = useMemo(() => clientFor(instanceId), [clientFor, instanceId]);
  const workspace = useLiveWorkspace(instanceId);
  const [picked, setPicked] = useState<SettingsPageId>("general");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanUsage>>({});
  const [health, setHealth] = useState<{ version?: string } | null>(null);
  const [error, setError] = useState("");
  const [theme, setTheme] = useThemeChoice();

  const page: SettingsPageId | null = pushed ?? (wide ? picked : null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: pushed ? PAGES.find((item) => item.id === pushed)?.label : "Settings" });
  }, [navigation, pushed]);

  useEffect(() => {
    if (!client) return;
    let current = true;
    const fail = (err: unknown) => current && setError(err instanceof Error ? err.message : String(err));
    client.request("/api/config").then((body) => current && setConfig(body), fail);
    client.request("/api/instances").then((body) => current && setEngines(body.instances ?? []), () => {});
    client.request("/api/plan-usage").then((body) => current && setPlans(body.usage ?? {}), () => {});
    client.request("/api/health").then((body) => current && setHealth(body), () => {});
    return () => {
      current = false;
    };
  }, [client]);

  /** Shown at once and put back if the computer refuses it. */
  const save: Save = (patch) => {
    if (!client || !config) return;
    const before = config;
    const merged: Config = { ...config };
    for (const [key, value] of Object.entries(patch)) merged[key] = { ...(config[key] ?? {}), ...(value as Config) };
    setConfig(merged);
    client.request("/api/config", { method: "PUT", body: patch }).then(
      (body) => {
        if (body && typeof body === "object" && "agentDefaults" in body) setConfig(body);
      },
      (err) => {
        setConfig(before);
        Alert.alert("Not saved", err instanceof Error ? err.message : String(err));
      },
    );
  };

  const patchAgent = (id: string, change: Config) => {
    client?.request(`/api/bots/${id}`, { method: "PATCH", body: change }).then(() => workspace?.reload(), (err) => {
      Alert.alert("Not saved", err instanceof Error ? err.message : String(err));
    });
  };

  const agents = (workspace?.bots ?? []).filter((bot) => !bot.hidden && !bot.archivedAt);
  const agent = agents.find((bot) => bot.id === agentId);

  const body = (id: SettingsPageId): ReactNode => {
    if (id === "connection") {
      if (!instance) return null;
      const transport = transportOf(instance.origin);
      return (
        <>
          <Group title="This Bloks">
            <Words label="Name on this device" saved={instance.name} onSave={(name) => void update(instance.id, { name: name.trim() || instance.name })} />
            <Value label="Address" value={instance.origin} />
            <Value label="Traffic" value={instance.access === "open" ? "No pairing: anyone who can reach it has control" : transport === "lan" || transport === "http" ? "Plain http, not encrypted" : transport === "tailscale" ? "Encrypted by Tailscale" : "Encrypted with HTTPS"} />
          </Group>
          <Group>
            <Link label="Change address or pair again" onPress={() => navigation.navigate("AddInstance", { instanceId: instance.id })} />
            <Link label="Remove from this device" danger onPress={() => Alert.alert(`Remove ${instance.name}?`, "This device forgets it. Its pairing stays on the computer until you remove it there.", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => void remove(instance.id).then(() => navigation.popTo("Instances")) },
            ])} />
          </Group>
        </>
      );
    }
    if (id === "devices") return client ? <DevicesPage client={client} /> : null;
    if (id === "engines") return <EnginesPage engines={engines} plans={plans} />;
    if (id === "about") {
      return (
        <Group title="About">
          <Value label="Bloks on this computer" value={health?.version ?? "…"} />
          <Value label="This client" value="Expo 1.0.0" />
        </Group>
      );
    }
    if (id === "agents") {
      if (agent) return <AgentPage bot={agent} engines={engines} patch={patchAgent} onBack={() => setAgentId(null)} />;
      return (
        <Group title="Agents">
          {agents.map((bot) => <Link key={bot.id} label={bot.name} value={selectionLabel(engines, bot.modelSelection)} onPress={() => setAgentId(bot.id)} />)}
        </Group>
      );
    }
    if (!config) return error ? <Text style={[styles.note, { color: colors.danger }]}>{error}</Text> : <ActivityIndicator />;
    if (id === "general") {
      return (
        <>
          <Group title="You">
            <Words label="Your name" saved={config.profile?.name ?? ""} onSave={(name) => save({ profile: { name } })} />
          </Group>
          <Group title="On this device">
            <Choice<ThemeChoice> label="Theme" value={theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} onChange={setTheme} />
          </Group>
        </>
      );
    }
    if (id === "about-you") {
      return (
        <Group title="About you">
          <Words label="What every agent knows about you" multiline saved={config.profile?.about ?? ""} onSave={(about) => save({ profile: { about } })} />
        </Group>
      );
    }
    if (id === "new-agents") return <NewAgentsPage config={config} save={save} engines={engines} />;
    return <BehaviourPage config={config} save={save} />;
  };

  const list = (
    <ScrollView style={{ backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      {Array.from(new Set(PAGES.map((item) => item.group))).map((group) => (
        <Group key={group} title={group}>
          {PAGES.filter((item) => item.group === group).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: wide && item.id === page }}
              onPress={() => {
                setAgentId(null);
                if (wide) setPicked(item.id);
                else navigation.push("Settings", { instanceId, page: item.id });
              }}
              style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: wide && item.id === page ? colors.border : "transparent", opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>{item.label}</Text>
              {!wide && <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>}
            </Pressable>
          ))}
        </Group>
      ))}
      <Text style={[styles.note, { color: colors.muted }]}>
        On the computer{instance?.access === "open" ? " or in Full app" : ""}: {COMPUTER_ONLY}
      </Text>
    </ScrollView>
  );

  if (!page) return list;
  const detail = (
    <ScrollView style={{ backgroundColor: colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.page, styles.measure]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {body(page)}
    </ScrollView>
  );
  if (!wide || pushed) return detail;
  return (
    <View style={[styles.split, { backgroundColor: colors.background }]}>
      <View style={[styles.side, { borderRightColor: colors.border }]}>{list}</View>
      <View style={styles.main}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: "row" },
  side: { width: 320, borderRightWidth: StyleSheet.hairlineWidth },
  main: { flex: 1 },
  page: { padding: 16, gap: 20 },
  measure: { width: "100%", maxWidth: 720, alignSelf: "center" },
  group: { gap: 6 },
  groupTitle: { fontSize: 13, fontWeight: "600", paddingHorizontal: 4 },
  card: { borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowWords: { flexShrink: 1, gap: 2 },
  choice: { gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center" },
  input: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputTall: { minHeight: 160, textAlignVertical: "top" },
  save: { alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 18, borderRadius: 10, justifyContent: "center" },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  back: { minHeight: 36, justifyContent: "center" },
});
