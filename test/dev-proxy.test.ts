// The dev page opened by a LAN or Tailscale address still talks to the
// loopback API through Vite. The API only treats a loopback Host and the
// dev UI's origin as the person at the keyboard, so those headers have to
// be rewritten. A different Origin must survive unchanged: that is what
// stops some other website from riding the proxy.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { isLocalRequest, isSameOrigin } from "../server/http-guard.ts";
import { devApiProxyHeaders } from "../vite.dev-proxy.ts";

const apiHost = "127.0.0.1:8799";
const asRequest = (headers: Record<string, string>) =>
  ({ headers, socket: { remoteAddress: "127.0.0.1" } }) as unknown as IncomingMessage;

test("a page opened on a Tailscale address is presented as the local dev UI", () => {
  const headers = devApiProxyHeaders(
    { host: "100.79.84.27:5199", origin: "http://100.79.84.27:5199" },
    apiHost,
  );
  assert.equal(isLocalRequest(asRequest(headers)), true);
});

test("a page opened on a LAN address is presented as the local dev UI", () => {
  const headers = devApiProxyHeaders(
    { host: "192.168.102.19:5199", origin: "http://192.168.102.19:5199" },
    apiHost,
  );
  assert.equal(isLocalRequest(asRequest(headers)), true);
});

test("a request with no Origin, such as the event stream, is presented as local", () => {
  const headers = devApiProxyHeaders({ host: "100.79.84.27:5199" }, apiHost);
  assert.equal(isLocalRequest(asRequest(headers)), true);
});

test("a website's Origin is not rewritten into the local dev UI", () => {
  const headers = devApiProxyHeaders(
    { host: "100.79.84.27:5199", origin: "https://evil.example" },
    apiHost,
  );
  assert.equal(headers.origin, "https://evil.example");
  assert.equal(isLocalRequest(asRequest(headers)), false);
  assert.equal(isSameOrigin(asRequest(headers)), false);
});
