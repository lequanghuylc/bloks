// One Bloks instance's API. Native clients send no Origin, which the server
// allows (server/http-guard.ts, isSameOrigin). `fetcher` is a parameter so
// the tests can run this in Node; the app passes expo/fetch, the fetch that
// can stream a response body in Expo Go.
import { candidateOrigins } from "./address.ts";
import { takeFrames } from "./messages.ts";

export type Fetcher = (url: string, init?: any) => Promise<any>;

export class Unpaired extends Error {
  constructor(message = "This device is no longer paired.") {
    super(message);
    this.name = "Unpaired";
  }
}

export interface Health {
  app: string;
  version?: string;
  static?: boolean;
}

export interface Probe {
  origin: string;
  health: Health;
  /** "open": the API answers without a token, as it does through `pnpm dev`'s
   * proxy. "pair": it wants a paired device. */
  access: "open" | "pair";
}

const CLIENT = "Expo 1.0.0";

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), ms);
  return { signal: control.signal, done: () => clearTimeout(timer) };
}

async function readJson(res: any): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text.slice(0, 200) };
  }
}

async function probeOrigin(fetcher: Fetcher, origin: string): Promise<Probe | null> {
  const limit = withTimeout(5000);
  try {
    const res = await fetcher(`${origin}/api/health`, { signal: limit.signal });
    if (!res.ok) return null;
    const health = await readJson(res);
    if (health?.app !== "bloks") return null;
    const list = await fetcher(`${origin}/api/bots?messages=0`, { signal: limit.signal });
    await list.text();
    return { origin, health, access: list.ok ? "open" : "pair" };
  } catch {
    return null;
  } finally {
    limit.done();
  }
}

/** Finds Bloks at an address. Trying the ports together keeps one that does
 * not answer from costing its whole timeout; the first candidate that
 * answers wins, so the API port is preferred over the dev port. */
export async function probeAddress(fetcher: Fetcher, text: string): Promise<Probe | null> {
  const results = await Promise.all(candidateOrigins(text).map((origin) => probeOrigin(fetcher, origin)));
  return results.find((result) => result !== null) ?? null;
}

/** Trades the six digits or the QR's token for a device's bearer token. */
export async function claimPairing(fetcher: Fetcher, origin: string, credential: string, device: string): Promise<string> {
  const limit = withTimeout(10000);
  try {
    const res = await fetcher(`${origin}/api/pair/claim`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bloks-client": CLIENT },
      body: JSON.stringify({ credential, device }),
      signal: limit.signal,
    });
    const body = await readJson(res);
    if (!res.ok || typeof body.token !== "string") {
      throw new Error(body.error || "That code was refused. Ask your computer for a new one.");
    }
    return body.token;
  } finally {
    limit.done();
  }
}

export class Client {
  readonly origin: string;
  private readonly fetcher: Fetcher;
  private readonly token: string | null;

  constructor(fetcher: Fetcher, origin: string, token: string | null) {
    this.fetcher = fetcher;
    this.origin = origin;
    this.token = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { "x-bloks-client": CLIENT, ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  async request<T = any>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
    const limit = withTimeout(init.timeoutMs ?? 20000);
    try {
      let res: any;
      try {
        res = await this.fetcher(`${this.origin}${path}`, {
          method: init.method ?? "GET",
          headers: this.headers(init.body === undefined ? undefined : { "content-type": "application/json" }),
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
          signal: limit.signal,
        });
      } catch {
        throw new Error("This computer did not answer.");
      }
      const body = await readJson(res);
      if (res.status === 401) throw new Unpaired();
      if (!res.ok) throw new Error(body.error || `Could not reach Bloks (${res.status}).`);
      return body as T;
    } finally {
      limit.done();
    }
  }

  /** A file the server holds, for an image view: its address and credential. */
  source(path: string): { uri: string; headers?: Record<string, string> } {
    return { uri: `${this.origin}${path}`, ...(this.token ? { headers: { authorization: `Bearer ${this.token}` } } : {}) };
  }

  /** Saves a picture on the computer and answers with its path there. */
  async uploadImage(bytes: Uint8Array, mime: string): Promise<string> {
    const limit = withTimeout(120000);
    try {
      const res = await this.fetcher(`${this.origin}/api/attachments`, {
        method: "POST",
        headers: this.headers({ "content-type": mime }),
        body: bytes,
        signal: limit.signal,
      });
      const body = await readJson(res);
      if (res.status === 401) throw new Unpaired();
      if (!res.ok || typeof body.path !== "string") throw new Error(body.error || "The picture could not be sent.");
      return body.path;
    } finally {
      limit.done();
    }
  }

  /** Follows /api/events until the signal aborts, resuming from the last
   * sequence it saw, as the web client's retry loop does. */
  async follow(
    signal: AbortSignal,
    handlers: { onFrame: (frame: any) => void; onState: (connected: boolean) => void; onUnpaired: () => void },
  ): Promise<void> {
    let lastSeq = 0;
    while (!signal.aborted) {
      try {
        const res = await this.fetcher(`${this.origin}/api/events${lastSeq ? `?since=${lastSeq}` : ""}`, {
          headers: this.headers({ accept: "text/event-stream" }),
          signal,
        });
        if (res.status === 401) {
          handlers.onUnpaired();
          return;
        }
        if (!res.ok || !res.body) throw new Error("stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          handlers.onState(true);
          const taken = takeFrames(buffer);
          buffer = taken.rest;
          for (const frame of taken.frames as any[]) {
            if (typeof frame?._seq === "number") lastSeq = frame._seq;
            handlers.onFrame(frame);
          }
        }
      } catch (err) {
        // the line dropped: said below, and tried again
        if (!signal.aborted) console.warn(`Bloks stream: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (signal.aborted) return;
      handlers.onState(false);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
