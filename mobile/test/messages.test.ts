import assert from "node:assert/strict";
import { test } from "node:test";

import { cardAnswerRequest, composeOutgoing, isApproval, previewOf, readSent, takeFrames, upsert, type Message } from "../src/lib/messages.ts";

const text = (id: string, extra: Partial<Message> = {}): Message => ({ id, role: "bot", kind: "text", text: id, ...extra });

test("upsert replaces in place, appends, and moves", () => {
  const list = [text("a"), text("b")];
  assert.deepEqual(upsert(list, text("a", { text: "new" })).map((m) => m.text), ["new", "b"]);
  assert.deepEqual(upsert(list, text("c")).map((m) => m.id), ["a", "b", "c"]);
  assert.deepEqual(upsert(list, text("a"), true).map((m) => m.id), ["b", "a"]);
});

test("the real message replaces the optimistic copy", () => {
  const pending: Message = { id: "local-1", role: "user", kind: "text", text: "hi", pending: true };
  const real: Message = { id: "m1", role: "user", kind: "text", text: "hi" };
  assert.deepEqual(upsert([pending], real).map((m) => m.id), ["m1"]);
});

test("a card's answer takes the route the web's does", () => {
  const place = { botId: "b1", messageId: "m1", taskId: "lane" };
  assert.deepEqual(cardAnswerRequest({ title: "t", options: [], requestId: "r" }, "Allow", place), {
    path: "/api/bots/b1/respond",
    body: { requestId: "r", behavior: "allow" },
  });
  assert.deepEqual(cardAnswerRequest({ title: "t", options: [], requestId: "r" }, "Blue", place).body, { requestId: "r", behavior: "answer", message: "Blue" });
  assert.equal(cardAnswerRequest({ title: "t", options: [], runId: "w" }, "Go", place).path, "/api/workflows/runs/w/answer");
  assert.deepEqual(cardAnswerRequest({ title: "t", options: [] }, "Go", place), {
    path: "/api/bots/b1/messages",
    body: { text: "Go", taskId: "lane" },
    thenMark: "/api/bots/b1/cards/m1",
  });
  assert.equal(cardAnswerRequest({ title: "t", options: [] }, "Go", { ...place, roomId: "r1" }).path, "/api/bloks/r1/messages");
});

test("an engine's question is not an approval", () => {
  assert.equal(isApproval({ title: "Your agent has a question", options: [], requestId: "r" }), false);
  assert.equal(isApproval({ title: "x", options: [], requestId: "r", tool: "Bash" }), true);
});

test("SSE frames split across chunks wait for the rest", () => {
  const first = takeFrames('data: {"a":1}\n\ndata: {"b"');
  assert.deepEqual(first.frames, [{ a: 1 }]);
  const second = takeFrames(`${first.rest}:2}\n\n: ping\n\ndata: nope\n\n`);
  assert.deepEqual(second.frames, [{ b: 2 }]);
  assert.equal(second.rest, "");
});

test("an image rides as the block the server's agents read", () => {
  const said = composeOutgoing(" look ", ['/a "b".jpg']);
  assert.equal(said, 'look\n\n<attached-image path="/a &quot;b&quot;.jpg" />');
  assert.deepEqual(readSent(said), { words: "look", images: ['/a "b".jpg'], files: [], pastes: 0 });
  assert.deepEqual(readSent('<attached-file path="/x.txt" />\n\n<pasted-text>\nhi\n</pasted-text>'), { words: "", images: [], files: ["/x.txt"], pastes: 1 });
});

test("a generated card's source stays out of previews", () => {
  const bot = (text: string): Message => ({ id: "m", role: "bot", kind: "text", text });
  assert.equal(previewOf([bot("Let me look.```openui\nroot = Card([head])\n```")]), "Let me look.");
  assert.equal(previewOf([bot("Streaming ```openui\nroot = Card(")]), "Streaming");
});
