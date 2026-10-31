import assert from "node:assert/strict";
import { test } from "node:test";

import { candidateOrigins, parsePairLink, transportOf } from "../src/lib/address.ts";

test("a bare LAN or Tailscale IP tries the API port, then the dev port", () => {
  assert.deepEqual(candidateOrigins("192.168.1.20").slice(0, 2), ["http://192.168.1.20:8799", "http://192.168.1.20:5199"]);
  assert.deepEqual(candidateOrigins("100.79.84.27").slice(0, 2), ["http://100.79.84.27:8799", "http://100.79.84.27:5199"]);
});

test("a port or https the person gave is taken at its word", () => {
  assert.deepEqual(candidateOrigins("100.79.84.27:5199"), ["http://100.79.84.27:5199"]);
  assert.deepEqual(candidateOrigins("https://bloks.example.com/"), ["https://bloks.example.com"]);
  assert.deepEqual(candidateOrigins("HTTP://mac.local:8799"), ["http://mac.local:8799"]);
});

test("nonsense is refused", () => {
  assert.deepEqual(candidateOrigins(""), []);
  assert.deepEqual(candidateOrigins("a b"), []);
  assert.deepEqual(candidateOrigins("host:99999"), []);
  assert.deepEqual(candidateOrigins("host/path"), []);
});

test("transport says which plain http is private", () => {
  assert.equal(transportOf("http://100.79.84.27:8799"), "tailscale");
  assert.equal(transportOf("http://mac.tailnet.ts.net:8799"), "tailscale");
  assert.equal(transportOf("http://192.168.1.20:8799"), "lan");
  assert.equal(transportOf("http://10.0.0.2:8799"), "lan");
  assert.equal(transportOf("http://172.20.0.2:8799"), "lan");
  assert.equal(transportOf("http://100.128.0.1:8799"), "http");
  assert.equal(transportOf("https://bloks.example.com"), "https");
});

test("the desktop's pairing link is read", () => {
  const token = `bloks_pair_${"a".repeat(32)}`;
  const link = parsePairLink(`bloks://pair?address=192.168.1.20%3A8799&token=${token}&code=123456&name=Studio%20Mac`);
  assert.deepEqual(link, { origin: "http://192.168.1.20:8799", host: "192.168.1.20", port: 8799, token, code: "123456", name: "Studio Mac" });
  assert.equal(parsePairLink("https://evil.example/?token=x"), null);
  assert.equal(parsePairLink(`bloks://pair?address=host:8799&token=short&code=123456`), null);
});
