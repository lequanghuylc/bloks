// The Bloks instances this phone knows, one per computer or workspace. The
// list is plain storage; a token lives in the keychain, under its instance.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { Client } from "./client.ts";
import { fetcher } from "./net";

export interface Instance {
  id: string;
  name: string;
  origin: string;
  access: "open" | "pair";
}

const LIST_KEY = "bloks.instances";
const tokenKey = (id: string) => `bloks.token.${id}`;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Instances {
  ready: boolean;
  instances: Instance[];
  add: (fields: Omit<Instance, "id">, token: string | null) => Promise<Instance>;
  update: (id: string, fields: Partial<Omit<Instance, "id">>, token?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clientFor: (id: string) => Client | null;
}

const Context = createContext<Instances | null>(null);

export function InstancesProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      let list: Instance[] = [];
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(LIST_KEY)) ?? "[]");
        if (Array.isArray(saved)) list = saved;
      } catch {
        // an unreadable list is an empty one
      }
      const found: Record<string, string> = {};
      await Promise.all(list.map(async (item) => {
        const token = await SecureStore.getItemAsync(tokenKey(item.id)).catch(() => null);
        if (token) found[item.id] = token;
      }));
      setTokens(found);
      setInstances(list);
      setReady(true);
    })();
  }, []);

  const save = useCallback(async (list: Instance[]) => {
    setInstances(list);
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
  }, []);

  const putToken = useCallback(async (id: string, token: string | null) => {
    if (token) await SecureStore.setItemAsync(tokenKey(id), token);
    else await SecureStore.deleteItemAsync(tokenKey(id));
    setTokens((current) => {
      const { [id]: _gone, ...rest } = current;
      return token ? { ...rest, [id]: token } : rest;
    });
  }, []);

  const value = useMemo<Instances>(() => ({
    ready,
    instances,
    add: async (fields, token) => {
      const made = { ...fields, id: newId() };
      await putToken(made.id, token);
      await save([...instances, made]);
      return made;
    },
    update: async (id, fields, token) => {
      if (token !== undefined) await putToken(id, token);
      await save(instances.map((item) => (item.id === id ? { ...item, ...fields } : item)));
    },
    remove: async (id) => {
      await putToken(id, null);
      await save(instances.filter((item) => item.id !== id));
    },
    clientFor: (id) => {
      const item = instances.find((entry) => entry.id === id);
      return item ? new Client(fetcher, item.origin, tokens[id] ?? null) : null;
    },
  }), [ready, instances, tokens, putToken, save]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInstances(): Instances {
  const value = useContext(Context);
  if (!value) throw new Error("useInstances outside InstancesProvider");
  return value;
}
