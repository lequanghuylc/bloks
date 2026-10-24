# Remote web client implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a phone-sized chat page from the Mac at `/remote` that pairs with the desktop QR and talks to the agents and rooms on that Mac.

**Architecture:** `remote/pair-link.js` parses the existing `bloks://pair` link and builds an origin. The server serves `remote/` at `/remote` without a bearer when phone access is on. `remote/app.js` scans or accepts that link, lets the person edit the host, claims a bearer, then lists chats and streams events with `fetch`.

**Tech Stack:** Node http server, plain browser modules, node:test.

## Global Constraints

- No Tailscale address, host, or port is written into the client.
- Device name sent at claim is `Safari`.
- Bearer is stored at `localStorage` key `bloks.remote.token`.
- Breakpoint is 768px. Narrow pushes history. Wide uses `replaceState`.
- Remote `GET /remote` needs no bearer. Every other remote API path is unchanged.
- Message text is escaped by using DOM text, not HTML strings.
- Do not commit unless the person asks.

---

### Task 1: Pair link parser

**Files:**
- Create: `remote/pair-link.js`
- Test: `test/remote-pair-link.test.ts`

**Interfaces:**
- Produces: `parsePairLink(text: string) => { address, host, port, token, code, name } | null`
- Produces: `buildOrigin({ scheme, host, port }) => string | null`

- [ ] Write failing tests for a real link, rejected links, port 8799 kept, and https port 443 dropped.
- [ ] Run `node --test test/remote-pair-link.test.ts` and confirm fail.
- [ ] Implement `remote/pair-link.js`.
- [ ] Re-run and confirm pass.

### Task 2: Serve `/remote`

**Files:**
- Create: `server/remote-client.ts`
- Modify: `server/index.ts` (import, remote gate, local gate)
- Modify: `scripts/mark-server-esm.mjs` (copy `remote/` into `dist-server/remote`)
- Test: `test/remote-client.test.ts`

**Interfaces:**
- Consumes: `openInside`, `readHeld`, `SECURITY_HEADERS`
- Produces: `serveRemoteClient(res, pathname, headers) => boolean`

- [ ] Write a harness test: remote `GET /remote` is the page, `GET /api/bots` is still 401, claim still works, `/remote/%2e%2e/...` does not return server source.
- [ ] Run it and confirm fail.
- [ ] Serve files from `remote/` beside the module, else one directory up.
- [ ] Re-run and confirm pass.

### Task 3: The page

**Files:**
- Create: `remote/index.html`, `remote/app.css`, `remote/app.js`

- [ ] Scanner, paste, and typed code. Confirm screen edits scheme, host, and port.
- [ ] Same-origin claim, or navigate to `{origin}/remote#credential=`.
- [ ] List and conversation, narrow and wide, events via `fetch` with the bearer.
- [ ] Disconnect clears only this browser's token.

### Task 4: Verify

- [ ] Run `node --test test/remote-pair-link.test.ts test/remote-client.test.ts`.
