// The phone page, served from this Mac at /remote.
//
// A remote browser has to load the page before it has a bearer, so these
// files are the one remote GET that is not the API. The files live in
// remote/ at the repo root. A packaged server finds them beside the
// compiled module, where the build copied them.
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";

import { openInside, readHeld } from "./open-inside.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

let rootMemo: string | null | undefined;

/** Where the phone page files are, or null when this build has none. */
export function remoteClientRoot(): string | null {
  if (rootMemo !== undefined) return rootMemo;
  const candidates = [
    fileURLToPath(new URL("./remote", import.meta.url)),
    fileURLToPath(new URL("../remote", import.meta.url)),
  ];
  rootMemo = candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
  return rootMemo;
}

/** The file name inside remote/, or null when this path is not the page. */
export function remoteClientName(pathname: string): string[] | null {
  if (pathname !== "/remote" && !pathname.startsWith("/remote/")) return null;
  if (pathname === "/remote" || pathname === "/remote/") return ["index.html"];
  const parts = pathname.slice("/remote/".length).split("/");
  if (!parts.length || parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts;
}

/**
 * Writes the phone page and returns whether this path was its concern.
 * A missing file is a 404, still handled, so it cannot fall through to
 * the API's "pair this device first".
 */
export function serveRemoteClient(res: ServerResponse, pathname: string, headers: Record<string, string>): boolean {
  const name = remoteClientName(pathname);
  if (!name) return false;
  const root = remoteClientRoot();
  const held = root ? openInside(root, name) : null;
  const data = held && readHeld(held);
  if (!data) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...headers });
    res.end("not found");
    return true;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(name[name.length - 1])] ?? "application/octet-stream",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
  return true;
}
