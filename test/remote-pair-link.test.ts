// The link the desktop QR already carries, and the origin the phone page
// dials after the person edits the host.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildOrigin, parsePairLink } from "../remote/pair-link.js";

const TOKEN = `bloks_pair_${"a".repeat(32)}`;

test("a desktop pairing link yields the address, token, code, and name", () => {
  const parsed = parsePairLink(
    `bloks://pair?address=${encodeURIComponent("192.168.1.4:8799")}&token=${TOKEN}&code=123456&name=${encodeURIComponent("Kitchen Mac")}`,
  );
  assert.deepEqual(parsed, {
    address: "192.168.1.4:8799",
    host: "192.168.1.4",
    port: 8799,
    token: TOKEN,
    code: "123456",
    name: "Kitchen Mac",
  });
});

test("an ipv6 address keeps its brackets out of the host field", () => {
  const parsed = parsePairLink(`bloks://pair?address=${encodeURIComponent("[::1]:8799")}&token=${TOKEN}&code=000000`);
  assert.equal(parsed?.host, "::1");
  assert.equal(parsed?.port, 8799);
  assert.equal(parsed?.name, "");
});

test("anything that is not a complete pairing link is rejected", () => {
  for (const raw of [
    "",
    "https://example.com",
    "bloks://team/research",
    `bloks://pair?address=192.168.1.4:8799&token=bloks_pair_short&code=123456`,
    `bloks://pair?address=192.168.1.4:8799&token=${TOKEN}&code=12345`,
    `bloks://pair?address=192.168.1.4&token=${TOKEN}&code=123456`,
    `bloks://pair?token=${TOKEN}&code=123456`,
  ]) {
    assert.equal(parsePairLink(raw), null, raw);
  }
});

test("the origin keeps 8799 and drops the default https port", () => {
  assert.equal(buildOrigin({ scheme: "http", host: "192.168.1.4", port: 8799 }), "http://192.168.1.4:8799");
  assert.equal(buildOrigin({ scheme: "https", host: "mac.example", port: 443 }), "https://mac.example");
  assert.equal(buildOrigin({ scheme: "https", host: "::1", port: 443 }), "https://[::1]");
  assert.equal(buildOrigin({ scheme: "http", host: "mac.example", port: 80 }), "http://mac.example");
  assert.equal(buildOrigin({ scheme: "ftp", host: "mac.example", port: 8799 }), null);
  assert.equal(buildOrigin({ scheme: "https", host: "", port: 8799 }), null);
  assert.equal(buildOrigin({ scheme: "https", host: "mac.example", port: 0 }), null);
});
