import assert from "node:assert/strict";
import { test } from "node:test";

import { actionsFor, artifactPath, clock, excerptOf, opensAsPicture, redoLine, splitWaiting, stamp, stepWords, turnStartedAt, waitingSender, waitingStatus, waitingTitle, workingLineOwed, workingStep, REPLY_HOLD_MS } from "../src/lib/chatMeta.ts";
import { rowsOf } from "../src/lib/turnFold.ts";
import type { Message } from "../src/lib/messages.ts";

const say = (over: Partial<Message>): Message => ({ id: "m", role: "user", kind: "text", text: "hi", ...over });

test("a stamp says the time today and the date on another day", () => {
  const now = new Date(2026, 10, 1, 12, 0).getTime();
  assert.equal(stamp(new Date(2026, 10, 1, 9, 5).getTime(), now, "en-US"), "9:05 AM");
  assert.match(stamp(new Date(2026, 9, 30, 9, 5).getTime(), now, "en-GB"), /30 Oct.*0?9:05/);
  assert.match(stamp(new Date(2025, 9, 30, 9, 5).getTime(), now, "en-GB"), /2025/);
  assert.equal(stamp(undefined), "");
});

test("the clock keeps a fixed width within each unit", () => {
  assert.equal(clock(8000), "8s");
  assert.equal(clock(65000), "1m 05s");
  assert.equal(clock(7 * 3600000 + 43 * 60000), "7h 43m");
  assert.equal(clock(-5), "0s");
});

test("what never went waits with what is queued, and neither is drawn in the transcript", () => {
  const list = [say({ id: "a" }), say({ id: "b", queued: true }), say({ id: "c", unsent: true }), say({ id: "d", queued: true, deleted: true })];
  const { said, waiting } = splitWaiting(list);
  assert.deepEqual(said.map((m) => m.id), ["a"]);
  assert.deepEqual(waiting.map((m) => m.id), ["b", "c"]);
  assert.deepEqual(rowsOf(list.slice(0, 3), { running: true, room: false }).map((row) => row.key), ["a"]);
});

test("a waiting message says why it waits and who sent it", () => {
  const now = new Date(2026, 10, 1, 12, 0).getTime();
  const at = new Date(2026, 10, 1, 9, 7).getTime();
  assert.match(waitingStatus(say({ queuedAt: at }), true, false, now), /^Queued at .*, sends when this reply finishes$/);
  assert.match(waitingStatus(say({ queuedAt: at }), false, false, now), /^Queued at [^,]*$/);
  assert.match(waitingStatus(say({ at, delivery: { route: "queued", line: "Set to wait" } }), true, false, now), /^Set to wait, queued at /);
  assert.equal(waitingStatus(say({}), true, true, now), "Queued, waits until you save or cancel");
  assert.match(waitingStatus(say({ unsent: true }), true), /^Not sent/);
  assert.equal(waitingSender(say({ agent: { dir: "in", peerId: "a", peerName: "Ava" } })), "Ava");
  assert.equal(waitingSender(say({})), null);
  assert.equal(waitingTitle([say({ queued: true })]), "A message is waiting to send.");
  assert.equal(waitingTitle([say({ queued: true }), say({ unsent: true })]), "2 messages are waiting to send.");
  assert.equal(waitingTitle([say({ unsent: true })]), "A message didn't send.");
});

test("a turn's clock starts at the message that began it", () => {
  assert.equal(turnStartedAt([say({ at: 1 }), say({ at: 2, midTurn: true }), say({ at: 3, role: "bot" })]), 1);
  assert.equal(turnStartedAt([say({ at: 2, queued: true })]), null);
});

test("a fresh reply holds the working line back a moment", () => {
  const reply = say({ role: "bot" });
  assert.equal(workingLineOwed(false, "", reply, 9999), false);
  assert.equal(workingLineOwed(true, "", reply, 0), false);
  assert.equal(workingLineOwed(true, "", reply, REPLY_HOLD_MS), true);
  assert.equal(workingLineOwed(true, "words", reply, 0), true);
  assert.equal(workingLineOwed(true, "", say({}), 0), true);
});

test("the step says what the running call is doing, in this turn only", () => {
  assert.equal(stepWords({ name: "WebSearch" }), "Searching the web");
  assert.equal(stepWords({ name: "Bash", command: "npm test" }), "Running tests");
  assert.equal(stepWords({ name: "Bash", command: "ls" }), "Running a command");
  assert.equal(stepWords({ name: "messaged Ava" }), "Messaging Ava");
  const open = say({ id: "t", role: "bot", kind: "activity", tool: { name: "WebSearch" } });
  assert.equal(workingStep([say({}), open], ""), "Searching the web");
  assert.equal(workingStep([open, say({})], ""), "Working");
  assert.equal(workingStep([say({}), open], "words"), "Writing");
});

test("only your own message in a chat can be edited or rewound to", () => {
  assert.deepEqual(actionsFor(say({}), false), ["copy", "reply", "forward", "edit", "rewind", "delete"]);
  assert.deepEqual(actionsFor(say({ role: "bot" }), false), ["copy", "reply", "forward", "delete"]);
  assert.deepEqual(actionsFor(say({}), true), ["copy", "reply", "forward", "delete"]);
  assert.deepEqual(actionsFor(say({ via: "goal" }), false), ["copy", "reply", "forward", "rewind", "delete"]);
  assert.deepEqual(actionsFor(say({ pending: true }), false), []);
  assert.deepEqual(actionsFor(say({ deleted: true }), false), []);
  assert.deepEqual(actionsFor(say({ text: "" }), false), []);
});

test("an excerpt is one short line", () => {
  assert.equal(excerptOf(say({ text: "a\n\n b" })), "a b");
  assert.equal(excerptOf(say({ text: "x".repeat(200) })).length, 140);
});

test("redo says what it takes back", () => {
  assert.equal(redoLine({ offered: true, messages: 3, files: 2, resend: 1 }, "M14"), "Removes 3 messages and restores 2 files.");
  assert.equal(redoLine({ offered: true, messages: 1, files: 0, resend: 2, sent: true }, "M14"), "Removes 1 message. Resends your 2 messages. Messages it sent, and anything outside the folder, stay.");
  assert.equal(redoLine({ offered: true, messages: 2, files: 0, resend: 1, working: true }, "M14"), "Stops M14, removes 2 messages and undoes its file changes.");
});

test("a shared file's route and whether a picture view can draw it", () => {
  assert.equal(artifactPath("b1", "shots/a b.png"), "/api/bots/b1/artifacts/shots%2Fa%20b.png");
  assert.equal(opensAsPicture("image/png", "x"), true);
  assert.equal(opensAsPicture(undefined, "diagram-fixed.JPG"), true);
  assert.equal(opensAsPicture("image/svg+xml", "x.svg"), false);
  assert.equal(opensAsPicture("application/pdf", "x.pdf"), false);
});
