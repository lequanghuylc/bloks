import assert from "node:assert/strict";
import { test } from "node:test";

import type { Message } from "../src/lib/messages.ts";
import { foldLine, kindOf, plainRows, rowsOf, toolSummary, workedFor } from "../src/lib/turnFold.ts";

const you = (id: string, at: number, extra: Partial<Message> = {}): Message => ({ id, role: "user", kind: "text", text: id, at, ...extra });
const bot = (id: string, at: number, extra: Partial<Message> = {}): Message => ({ id, role: "bot", kind: "text", text: id, at, ...extra });
const tool = (id: string, at: number, name = "Bash"): Message => ({ id, role: "bot", kind: "activity", tool: { name, ok: true }, at });

test("a finished turn folds its work and keeps its last words", () => {
  const rows = rowsOf([you("q", 0), bot("note", 1000), tool("t1", 2000), tool("t2", 3000), bot("answer", 42000), you("next", 50000)], { running: false, room: false });
  assert.deepEqual(rows.map((row) => row.type), ["message", "fold", "message", "message"]);
  const fold = rows[1].type === "fold" ? rows[1].fold : null;
  assert.equal(fold?.tools.length, 2);
  assert.equal(foldLine(fold!, () => undefined), "Worked 42 sec · 2 commands");
  assert.equal(rows[2].key, "answer");
});

test("a turn still running shows its work", () => {
  const rows = rowsOf([you("q", 0), tool("t1", 1000), tool("t2", 2000)], { running: true, room: false });
  assert.deepEqual(rows.map((row) => row.type), ["message", "tools"]);
});

test("cards still waiting, files made and notices stay out of the fold", () => {
  const rows = rowsOf([
    you("q", 0),
    tool("t", 1),
    { id: "c", role: "bot", kind: "options", card: { title: "May I", options: ["Allow"], requestId: "r" }, at: 2 },
    { id: "n", role: "bot", kind: "notice", text: "Careful", at: 3 },
    { id: "a", role: "bot", kind: "artifact", artifact: { name: "x.pdf" }, at: 4 },
    bot("done", 5),
    you("next", 6),
  ], { running: false, room: false });
  const keys = rows.map((row) => row.key);
  for (const key of ["c", "n", "a", "done"]) assert.ok(keys.includes(key), key);
  assert.ok(!keys.includes("t"));
});

test("a turn another agent started says who asked", () => {
  const agent = { dir: "in" as const, peerId: "p1", peerName: "M14" };
  const rows = rowsOf([
    you("asked", 0, { agent }),
    tool("t", 1000),
    { id: "out", role: "bot", kind: "text", text: "ok", at: 2000, agent: { dir: "out", peerId: "p2", peerName: "Nova" } },
    bot("reply", 3000),
    you("next", 9000),
  ], { running: false, room: false });
  assert.equal(rows.some((row) => row.type === "exchange"), false, "both sit under the fold's line");
  const fold = rows.find((row) => row.type === "fold");
  assert.equal(fold?.type === "fold" && foldLine(fold.fold, (id) => (id === "p1" ? "M14 now" : undefined)), "M14 now asked · worked 3 sec · 1 command · messaged Nova");
});

test("another agent's words outside a fold are a compact row", () => {
  const rows = plainRows([{ id: "o", role: "bot", kind: "text", text: "hi", agent: { dir: "out", peerId: "p", peerName: "Nova" } }]);
  assert.equal(rows[0].type, "exchange");
});

test("the person's words inside a turn are never folded", () => {
  const rows = rowsOf([you("q", 0), tool("a", 1), you("more", 2, { midTurn: true }), tool("b", 3), bot("done", 4), you("next", 5)], { running: false, room: false });
  assert.ok(rows.some((row) => row.key === "more"));
});

test("a room folds each agent's stretch under its name", () => {
  const rows = rowsOf([
    you("q", 0),
    { ...tool("t", 1000), from: "a1" },
    bot("said", 5000, { from: "a1" }),
    bot("other", 6000, { from: "a2" }),
  ], { running: false, room: true });
  const fold = rows.find((row) => row.type === "fold");
  assert.equal(fold?.type === "fold" && foldLine(fold.fold, () => "Ava"), "Ava worked 4 sec · 1 command");
  assert.ok(rows.some((row) => row.key === "said") && rows.some((row) => row.key === "other"));
});

test("hidden kinds keep their quiet rows, and queued waits above the box", () => {
  const rows = plainRows([bot("a", 0, { deleted: true }), bot("b", 1, { quiet: true }), bot("c", 2, { quiet: true }), { id: "d", role: "bot", kind: "options", card: { title: "x", options: [], dismissed: true }, at: 3 }]);
  assert.deepEqual(rows.map((row) => row.type), ["taken", "quiet"]);
  assert.equal(rowsOf([you("w", 0, { queued: true })], { running: false, room: false }).length, 0);
});

test("words match the web's", () => {
  assert.equal(workedFor(180000), "3 min");
  assert.equal(workedFor(3900000), "1 hr 5 min");
  assert.equal(toolSummary(["Bash", "Bash", "Read", "Grep", "Edit", "Thing"]), "Ran 2 commands, read 1 file, searched once, edited 1 file, used 1 other tool");
  assert.equal(kindOf("mcp__x__bash"), "command");
  assert.equal(kindOf("git status"), "command");
});
