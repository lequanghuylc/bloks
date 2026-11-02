// What this device keeps between runs: each conversation's messages, its unsent
// words and the list of agents and rooms, so a chat opens at once and the server
// only has to correct it. Tokens are not here: they stay in the keychain.
//
// A read is held in memory after the first, so coming back to a chat is
// synchronous. Writes wait a moment and go together, since a reply can bring many
// changes in a row, and go at once when the app leaves the foreground.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const PREFIX = "bloks.cache.v1.";
const WRITE_AFTER_MS = 400;

const memory = new Map<string, unknown>();
// null: to be removed. Turned to text only when written, however often it changes.
const waiting = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!waiting.size) return;
  const writes: [string, string][] = [];
  const removes: string[] = [];
  for (const [key, value] of waiting) {
    if (value === null) removes.push(key);
    else writes.push([key, JSON.stringify(value)]);
  }
  waiting.clear();
  // a device out of room keeps working, and only opens more slowly
  if (writes.length) void AsyncStorage.multiSet(writes).catch(() => {});
  if (removes.length) void AsyncStorage.multiRemove(removes).catch(() => {});
}

AppState.addEventListener("change", (state) => {
  if (state !== "active") flush();
});

function later(): void {
  if (!timer) timer = setTimeout(flush, WRITE_AFTER_MS);
}

/** Held in memory already, or undefined when it has to be read. */
export function peek<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export async function read<T>(key: string): Promise<T | null> {
  if (memory.has(key)) return memory.get(key) as T;
  // removed a moment ago, and the disk has not heard yet
  if (waiting.get(key) === null) return null;
  try {
    const saved = await AsyncStorage.getItem(key);
    // something written while this was being read is the newer
    if (memory.has(key)) return memory.get(key) as T;
    if (waiting.get(key) === null) return null;
    const value = saved === null ? null : (JSON.parse(saved) as T);
    if (value !== null) memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function put(key: string, value: unknown): void {
  memory.set(key, value);
  waiting.set(key, value);
  later();
}

export function remove(key: string): void {
  memory.delete(key);
  waiting.set(key, null);
  later();
}

const instancePrefix = (instanceId: string) => `${PREFIX}${instanceId}.`;

export const chatKey = (instanceId: string, thread: string) => `${instancePrefix(instanceId)}chat.${thread}`;
export const draftKey = (instanceId: string, thread: string) => `${instancePrefix(instanceId)}draft.${thread}`;
export const workspaceKey = (instanceId: string) => `${instancePrefix(instanceId)}workspace`;

/** Everything kept for an instance, when it is removed from this device. */
export async function forgetInstance(instanceId: string): Promise<void> {
  const prefix = instancePrefix(instanceId);
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
  for (const key of [...waiting.keys()]) if (key.startsWith(prefix)) waiting.delete(key);
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(prefix)));
}
