// Turning what a person typed or scanned into a place to connect. Pure, so
// the tests can run it. Hermes' URL has no reliable searchParams, which is
// why nothing here leans on URL.

/** The packaged app and bloks-server serve the API here (server/index.ts). */
export const API_PORT = 8799;
/** `pnpm dev`, which proxies /api to the server (vite.config.ts). */
export const DEV_PORT = 5199;

export type Transport = "tailscale" | "lan" | "https" | "http";

/** The origins worth trying for an address, in order. A port or scheme the
 * person gave is taken at its word; otherwise the API port comes first,
 * since it is the one that asks for pairing. */
export function candidateOrigins(text: string): string[] {
  const raw = text.trim().replace(/\/+$/, "");
  const match = /^(?:(https?):\/\/)?(\[[0-9a-fA-F:.]+\]|[^\s/:?#[\]]+)(?::(\d{1,5}))?$/i.exec(raw);
  if (!match) return [];
  const [, scheme, host, port] = match;
  if (port && (Number(port) < 1 || Number(port) > 65535)) return [];
  const lower = scheme?.toLowerCase();
  if (port) return [`${lower ?? "http"}://${host}:${port}`];
  if (lower === "https") return [`https://${host}`];
  if (lower === "http") return [`http://${host}:${API_PORT}`, `http://${host}:${DEV_PORT}`, `http://${host}`];
  return [`http://${host}:${API_PORT}`, `http://${host}:${DEV_PORT}`, `https://${host}`];
}

function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//i, "").replace(/:\d+$/, "").toLowerCase();
}

/** How a connection travels, which decides whether its traffic is private:
 * Tailscale encrypts underneath plain http, a LAN does not. */
export function transportOf(origin: string): Transport {
  if (/^https:/i.test(origin)) return "https";
  const host = hostOf(origin);
  if (host.endsWith(".ts.net")) return "tailscale";
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 100 && b >= 64 && b <= 127) return "tailscale";
    if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return "lan";
  }
  if (host.endsWith(".local")) return "lan";
  return "http";
}

export interface PairLink {
  origin: string;
  host: string;
  port: number;
  token: string;
  code: string;
  name: string;
}

function param(query: string, name: string): string {
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    } catch {
      return "";
    }
  }
  return "";
}

/** The desktop's QR, a bloks://pair link (remote/pair-link.js). */
export function parsePairLink(text: string): PairLink | null {
  const match = /^bloks:\/\/pair\/?\?(.*)$/i.exec(text.trim());
  if (!match) return null;
  const query = match[1].split("#")[0];
  const token = param(query, "token");
  const code = param(query, "code");
  const where = /^(\[[0-9a-fA-F:.]+\]|[^\s:[\]]+):(\d{1,5})$/.exec(param(query, "address"));
  if (!where || !/^bloks_pair_[A-Za-z0-9_-]{32}$/.test(token) || !/^\d{6}$/.test(code)) return null;
  const port = Number(where[2]);
  if (port < 1 || port > 65535) return null;
  return { origin: `http://${where[1]}:${port}`, host: where[1], port, token, code, name: param(query, "name") };
}
