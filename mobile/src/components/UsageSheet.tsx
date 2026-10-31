// How full this conversation is and what it has used: the web's ring card
// (src/components/ComposerRing.tsx). Asked afresh each time it opens, since
// nothing else brings these figures up to date.
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Client } from "../lib/client.ts";
import { contextPercent, measuredContext, planRows, shortTokens, type Engine, type PlanUsage } from "../lib/engines.ts";
import type { Bot, Lane } from "../lib/messages.ts";
import { useColors } from "../lib/theme";
import { Sheet } from "./Sheet";

type Spent = { turns: number; input: number; output: number; cost: number };

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }]}>
      <View style={styles.line}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!!aside && <Text numberOfLines={1} style={[styles.small, { color: colors.muted, flexShrink: 1 }]}>{aside}</Text>}
      </View>
      {children}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.line}>
      <Text style={[styles.body, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.body, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function Bar({ fill, near }: { fill: number; near?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.track, { backgroundColor: colors.border }]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, fill)) * 100}%`, backgroundColor: near ? colors.warning : colors.accent }]} />
    </View>
  );
}

export function UsageSheet({ visible, onClose, client, bot, lane, engine }: { visible: boolean; onClose: () => void; client: Client | null; bot: Bot; lane: Lane | undefined; engine: Engine | undefined }) {
  const colors = useColors();
  const instanceId = bot.modelSelection?.instanceId;
  const [plan, setPlan] = useState<PlanUsage | null>(null);
  const [today, setToday] = useState<{ spent: Spent | null; costKnown: boolean } | "failed" | null>(null);

  useEffect(() => {
    if (!visible || !client) return;
    let current = true;
    setPlan(null);
    setToday(null);
    client.request("/api/plan-usage").then((body) => current && setPlan(instanceId ? body?.usage?.[instanceId] ?? null : null)).catch(() => {});
    client.request("/api/activity").then(
      (body: { agents?: Array<{ botId: string; today: Spent }>; costKnown?: boolean }) =>
        current && setToday({ spent: body?.agents?.find((agent) => agent.botId === bot.id)?.today ?? null, costKnown: Boolean(body?.costKnown) }),
      () => current && setToday("failed"),
    );
    return () => {
      current = false;
    };
  }, [visible, client, instanceId, bot.id]);

  const context = measuredContext(lane?.context);
  const usage = lane?.usage;
  const rows = planRows(plan, Date.now());
  const spent = today && today !== "failed" ? today.spent : null;
  const about = context?.window === "table" || context?.limitApproximate ? "about " : "";

  return (
    <Sheet visible={visible} title="Context and usage" onClose={onClose}>
      <Section title="Context" aside={context ? `${about}${contextPercent(context)}%` : undefined}>
        {context ? (
          <>
            <Bar fill={context.fraction} near={context.fraction >= 0.8} />
            <Text style={[styles.small, { color: colors.muted }]}>{about}{shortTokens(context.used)} of {shortTokens(context.limit)} tokens</Text>
            {context.summarised && <Text style={[styles.small, { color: colors.muted }]}>The earlier part of this conversation has been summarised.</Text>}
          </>
        ) : (
          <Text style={[styles.small, { color: colors.muted }]}>Not measured yet. It shows after a reply from the model this chat is on.</Text>
        )}
      </Section>
      <Section title="This conversation" aside={usage && usage.turns > 0 ? `${usage.turns} ${usage.turns === 1 ? "reply" : "replies"}` : undefined}>
        {usage && usage.turns > 0 ? (
          <>
            <Fact label="Tokens in" value={usage.input > 0 ? shortTokens(usage.input) : "Not reported"} />
            <Fact label="Tokens out" value={usage.output > 0 ? shortTokens(usage.output) : "Not reported"} />
          </>
        ) : (
          <Text style={[styles.small, { color: colors.muted }]}>Nothing sent yet.</Text>
        )}
      </Section>
      <Section title={`${bot.name} today`} aside={spent && spent.turns > 0 ? `${spent.turns} ${spent.turns === 1 ? "reply" : "replies"}` : undefined}>
        {today === null || today === "failed" ? (
          <Text style={[styles.small, { color: colors.muted }]}>{today ? "Couldn't check just now." : "Checking…"}</Text>
        ) : (
          <>
            <Fact label="Spend" value={today.costKnown && spent ? `$${spent.cost.toFixed(2)}` : "Not reported"} />
            {spent && spent.turns > 0 && <Fact label="Tokens" value={spent.input + spent.output > 0 ? shortTokens(spent.input + spent.output) : "Not reported"} />}
          </>
        )}
      </Section>
      {rows.length > 0 && (
        <Section title="Plan" aside={[engine?.displayName, plan?.plan].filter(Boolean).join(", ")}>
          {rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.line}>
                <Text style={[styles.body, { color: colors.muted }]}>{row.label}</Text>
                <Text style={[styles.body, { color: row.near ? colors.warning : colors.text }]}>{row.used}</Text>
              </View>
              <Bar fill={row.fill} near={row.near} />
              {!!row.note && <Text style={[styles.small, { color: colors.muted }]}>{row.note}</Text>}
            </View>
          ))}
        </Section>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 14, padding: 14, gap: 8 },
  title: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 15 },
  small: { fontSize: 13, lineHeight: 18 },
  line: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  row: { gap: 6 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
});
