// One instance while it is on screen: its agents and rooms, kept current by
// its event stream, which closes when the app leaves the foreground and
// catches up when it returns.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { Unpaired, type Client } from "./client.ts";
import { upsert, type Bot, type Room } from "./messages.ts";

export type FrameListener = (frame: any) => void;

export function useWorkspace(client: Client | null) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  // True until a connection really fails: iOS can hold a small first event back
  // until more arrive, so a quiet instance must not read as a lost one.
  const [connected, setConnected] = useState(true);
  const [unpaired, setUnpaired] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const listeners = useRef(new Set<FrameListener>());
  const origin = client?.origin;

  const clientRef = useRef(client);
  clientRef.current = client;

  const reload = useCallback(async () => {
    const api = clientRef.current;
    if (!api) return;
    try {
      const [botBody, roomBody] = await Promise.all([api.request("/api/bots?messages=20"), api.request("/api/bloks?messages=20")]);
      setBots(botBody.bots ?? []);
      setRooms(roomBody.bloks ?? []);
      setError("");
      setUnpaired(false);
    } catch (err) {
      if (err instanceof Unpaired) setUnpaired(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  const applyFrame = useCallback((frame: any) => {
    setConnected(true);
    switch (frame?.kind) {
      case "hello":
        if (!frame.resumed) void reload();
        break;
      case "bot":
        setBots((list) => list.map((bot) => (bot.id === frame.bot?.id ? { ...bot, ...frame.bot, messages: frame.bot.messages?.length ? frame.bot.messages : bot.messages } : bot)));
        break;
      case "bot.deleted":
        setBots((list) => list.filter((bot) => bot.id !== frame.id && bot.id !== frame.botId));
        break;
      case "blok":
        setRooms((list) => {
          const known = list.some((room) => room.id === frame.blok?.id);
          if (!known) return frame.blok ? [...list, frame.blok] : list;
          return list.map((room) => (room.id === frame.blok.id ? { ...room, ...frame.blok, messages: frame.blok.messages ?? room.messages } : room));
        });
        break;
      case "blok.deleted":
        setRooms((list) => list.filter((room) => room.id !== frame.id && room.id !== frame.blokId));
        break;
      case "message":
      case "message.patch":
        if (!frame.message) break;
        setBots((list) => list.map((bot) =>
          bot.threadId === frame.threadId || bot.activeTaskId === frame.threadId
            ? { ...bot, messages: upsert(bot.messages ?? [], frame.message, frame.moved === true) }
            : bot,
        ));
        setRooms((list) => list.map((room) =>
          room.id === frame.threadId ? { ...room, messages: upsert(room.messages ?? [], frame.message, frame.moved === true) } : room,
        ));
        break;
    }
    for (const listener of listeners.current) listener(frame);
  }, [reload]);

  useEffect(() => {
    if (!origin) return;
    let control: AbortController | null = null;
    const start = () => {
      control?.abort();
      const next = new AbortController();
      control = next;
      void clientRef.current?.follow(next.signal, {
        onFrame: applyFrame,
        onState: setConnected,
        onUnpaired: () => setUnpaired(true),
      });
    };
    void reload();
    start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void reload();
        start();
      } else if (state === "background") {
        control?.abort();
        control = null;
      }
    });
    return () => {
      subscription.remove();
      control?.abort();
    };
  }, [origin, applyFrame, reload]);

  const subscribe = useCallback((listener: FrameListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { bots, rooms, connected, unpaired, error, loaded, reload, subscribe };
}
