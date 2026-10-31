import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { createNavigationContainerRef } from "@react-navigation/native";

import { e2e } from "../lib/e2e";
import { useInstances } from "../lib/instances";
import type { Stack } from "../lib/routes";

export const navigationRef = createNavigationContainerRef<Stack>();

function params(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (url.split("?")[1] ?? "").split("&")) {
    const [key, value] = part.split("=");
    if (key) out[key] = decodeURIComponent(value ?? "");
  }
  return out;
}

/** exp://host/--/e2e?origin=…&kind=bot&id=…&name=…&skip=3, or ?fixture=1. */
export function E2EBridge() {
  const { ready, instances, add } = useInstances();
  const seen = useRef("");
  const state = useRef({ instances, add });
  state.current = { instances, add };

  useEffect(() => {
    if (!ready) return;
    const go = async (url: string | null) => {
      if (!url || !url.includes("e2e") || url === seen.current) return;
      seen.current = url;
      const p = params(url);
      for (let i = 0; i < 50 && !navigationRef.isReady(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
      if (p.fixture || p.chat) return navigationRef.navigate("Fixture");
      e2e.skip = Number(p.skip ?? 0);
      const known = state.current.instances.find((item) => item.origin === p.origin);
      const instance = known ?? (await state.current.add({ name: p.title ?? "Test", origin: p.origin, access: "open" }, null));
      navigationRef.reset({
        index: 1,
        routes: [
          { name: "Instances" },
          { name: "Conversations", params: { instanceId: instance.id, ...(p.id ? { open: { kind: p.kind === "room" ? "room" : "bot", id: p.id, name: p.name ?? "" } } : {}) } },
        ],
      });
    };
    void Linking.getInitialURL().then(go);
    const subscription = Linking.addEventListener("url", ({ url }) => void go(url));
    return () => subscription.remove();
  }, [ready]);
  return null;
}
