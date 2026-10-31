import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform as OS, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DEV_PORT, parsePairLink, transportOf } from "../lib/address.ts";
import { claimPairing, probeAddress, type Probe } from "../lib/client.ts";
import { useInstances } from "../lib/instances";
import { fetcher } from "../lib/net";
import type { ScreenProps } from "../lib/routes";
import { useColors } from "../lib/theme";

const DEVICE = `Bloks Expo (iOS ${String(OS.Version)})`.slice(0, 60);

function privacyLine(origin: string, access: Probe["access"]): string {
  const transport = transportOf(origin);
  if (access === "open") {
    return `This address answers with no pairing, as \`pnpm dev\` on port ${DEV_PORT} does: anyone who can reach it has full control of this Bloks.`;
  }
  if (transport === "tailscale") return "Plain http, encrypted underneath by Tailscale.";
  if (transport === "https") return "Encrypted with HTTPS.";
  return "Plain http with no encryption: others on this network could read the traffic. Prefer Tailscale on a network you do not trust.";
}

export function AddInstanceScreen({ navigation, route }: ScreenProps<"AddInstance">) {
  const colors = useColors();
  const { instances, add, update } = useInstances();
  const existing = instances.find((item) => item.id === route.params?.instanceId);
  const [address, setAddress] = useState(existing?.origin ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async (probe: Probe, token: string | null) => {
    const named = name.trim() || probe.origin.replace(/^https?:\/\//, "");
    const fields = { name: named, origin: probe.origin, access: probe.access };
    if (existing) await update(existing.id, fields, token);
    else await add(fields, token);
    navigation.popTo("Instances");
  };

  const pair = async (probe: Probe, credential: string) => {
    const token = await claimPairing(fetcher, probe.origin, credential, DEVICE);
    await finish(probe, token);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const probe = await probeAddress(fetcher, address);
    if (!probe) {
      throw new Error("No Bloks answered there. Check the address, that both devices share a network or Tailscale, that Tailscale is on, and that phone access is on in Bloks.");
    }
    setFound(probe);
    if (!name.trim() && probe.origin) setName(probe.origin.replace(/^https?:\/\//, "").replace(/:\d+$/, ""));
  });

  // Back from the scanner with a pairing link: the code carries everything.
  // Scanning replaces typing, never consent, so it fills the form and waits.
  const scanned = route.params?.scanned;
  useEffect(() => {
    if (!scanned) return;
    const link = parsePairLink(scanned);
    if (!link) {
      setError("That is not a Bloks pairing code.");
      return;
    }
    setAddress(link.origin);
    if (link.name) setName(link.name);
    setCode(link.token);
    void run(async () => {
      const probe = await probeAddress(fetcher, link.origin);
      if (!probe) throw new Error("The code names an address this phone cannot reach. Its Tailscale address may work: type it above, with the six digits.");
      setFound(probe);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned]);

  const input = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={OS.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.text }]}>Address</Text>
        <TextInput
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            setFound(null);
          }}
          placeholder="192.168.1.20 or 100.79.84.27:5199"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={input}
        />
        <Text style={[styles.hint, { color: colors.muted }]}>A local network IP, a Tailscale IP or name, or a domain. With no port, 8799 and 5199 are tried.</Text>

        <Text style={[styles.label, { color: colors.text }]}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Studio Mac" placeholderTextColor={colors.muted} style={input} />

        {!!error && <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text>}

        {!found && (
          <>
            <Pressable accessibilityRole="button" disabled={busy || !address.trim()} onPress={connect} style={[styles.primary, { backgroundColor: colors.accent, opacity: busy || !address.trim() ? 0.5 : 1 }]}>
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>Connect</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Scan")} style={styles.secondary}>
              <Text style={{ color: colors.accent, fontSize: 16 }}>Scan a pairing code</Text>
            </Pressable>
          </>
        )}

        {found && (
          <View style={[styles.found, { backgroundColor: colors.surface }]}>
            <Text style={[styles.foundTitle, { color: colors.text }]}>Bloks {found.health.version ?? ""} at {found.origin.replace(/^https?:\/\//, "")}</Text>
            <Text style={[styles.hint, { color: found.access === "open" ? colors.warning : colors.muted }]}>{privacyLine(found.origin, found.access)}</Text>
            {found.access === "pair" && (
              <>
                <Text style={[styles.hint, { color: colors.text }]}>On that computer, open Settings, Phone and devices, and press Pair a phone.</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Six digit code"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  autoCorrect={false}
                  style={[...input, { backgroundColor: colors.background }]}
                />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy || (found.access === "pair" && !code.trim())}
              onPress={() => run(() => (found.access === "pair" ? pair(found, code.trim()) : finish(found, null)))}
              style={[styles.primary, { backgroundColor: colors.accent, opacity: busy || (found.access === "pair" && !code.trim()) ? 0.5 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>{found.access === "pair" ? "Pair" : "Add"}</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 8 },
  label: { fontSize: 15, fontWeight: "600", marginTop: 8 },
  input: { minHeight: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18 },
  primary: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { fontSize: 16, fontWeight: "600" },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  found: { borderRadius: 14, padding: 14, gap: 8, marginTop: 12 },
  foundTitle: { fontSize: 15, fontWeight: "600" },
});
