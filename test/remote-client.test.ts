// The phone page is served to a browser that has not paired yet. The API
// beside it is not.
import { test } from "node:test";
import assert from "node:assert/strict";

import { startHarness, type Harness } from "./helpers/server.ts";

async function enabled(t: { after: (fn: () => unknown) => void }): Promise<Harness> {
  const h = await startHarness();
  t.after(() => h.stop());
  await h.fetch("/api/pair", { method: "PUT", body: JSON.stringify({ enabled: true }) });
  return h;
}

test("a remote browser can load the phone page without a token", async (t) => {
  const h = await enabled(t);

  const page = await h.fetchRemote("/remote");
  assert.equal(page.status, 200);
  assert.match(String(page.body), /\/remote\/app\.js/);

  const script = await h.fetchRemote("/remote/pair-link.js");
  assert.equal(script.status, 200);
  assert.match(String(script.body), /parsePairLink/);

  const bots = await h.fetchRemote("/api/bots");
  assert.equal(bots.status, 401);
  assert.match(bots.body.error, /pair/i);

  const started = await h.json("/api/pair/start", { method: "POST" });
  const claimed = await h.fetchRemote("/api/pair/claim", {
    method: "POST",
    body: JSON.stringify({ code: started.code, device: "Safari" }),
  });
  assert.equal(claimed.status, 200);
  assert.equal(typeof claimed.body.token, "string");
  const authed = await h.fetchRemote("/api/bots", { token: claimed.body.token });
  assert.equal(authed.status, 200);
  assert.ok(Array.isArray(authed.body.bots));
});

test("a remote path cannot climb out of the phone page", async (t) => {
  const h = await enabled(t);
  const escaped = await h.fetchRemote("/remote/%2e%2e/server/index.ts");
  assert.notEqual(escaped.status, 200);
  assert.equal(String(escaped.body).includes("function handleRequest"), false);
});
