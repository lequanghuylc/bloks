import assert from "node:assert/strict";
import { test } from "node:test";

import { clampEffort, contextPercent, effortLevels, engineStatus, measuredContext, modelLabel, planRows, readableId, selectionLabel, shortTokens, type Engine } from "../src/lib/engines.ts";

const claude: Engine = {
  instanceId: "claude",
  displayName: "Claude",
  snapshot: { state: "available", authenticated: true },
  efforts: ["low", "medium", "high", "max"],
  models: { default: "sonnet", options: [{ id: "opus", label: "Latest Opus" }, { id: "sonnet", label: "Latest Sonnet", efforts: ["low", "high"] }] },
};

test("a model's own levels narrow its engine's", () => {
  assert.deepEqual(effortLevels(claude, "opus"), ["low", "medium", "high", "max"]);
  assert.deepEqual(effortLevels(claude, "sonnet"), ["low", "high"]);
  assert.deepEqual(effortLevels(claude, ""), ["low", "high"], "an empty model means the default");
  assert.deepEqual(effortLevels(undefined), []);
});

test("a saved level shows as the one turns are sent at", () => {
  assert.equal(clampEffort("xhigh", ["low", "high"]), "high");
  assert.equal(clampEffort("max", ["low", "max"]), "max");
  assert.equal(clampEffort(null, ["low"]), undefined);
  assert.equal(clampEffort("high", []), undefined);
});

test("models are named as the web names them", () => {
  assert.equal(modelLabel(claude, "opus"), "Latest Opus");
  assert.equal(modelLabel(claude, ""), "Latest Sonnet");
  assert.equal(readableId("gpt-5.2-codex"), "GPT 5.2 Codex");
  assert.equal(readableId("claude-sonnet-4-5"), "Claude Sonnet 4.5");
  assert.equal(readableId("opencode/big-pickle"), "Big Pickle");
  assert.equal(selectionLabel([claude], { instanceId: "gone", model: "x-1" }), "X 1");
  assert.equal(selectionLabel([claude], undefined), "Choose a model");
});

test("an engine says why it cannot be used", () => {
  assert.equal(engineStatus(claude), "Ready");
  assert.equal(engineStatus({ ...claude, snapshot: { state: "available", authenticated: false } }), "Signed out");
  assert.equal(engineStatus({ ...claude, enabled: false, snapshot: { state: "error" } }), "Turned off");
});

test("only a vouched reading gives a figure", () => {
  assert.equal(measuredContext({ used: 10, limit: 100, fraction: 0.1, measured: false }), null);
  assert.equal(measuredContext({ used: 0, limit: 0, fraction: 0, measured: true }), null);
  assert.equal(measuredContext(undefined), null);
  const reading = { used: 12, limit: 100, fraction: 0.124, measured: true };
  assert.equal(contextPercent(measuredContext(reading)!), 12);
  assert.equal(shortTokens(1500), "1.5k");
  assert.equal(shortTokens(200000), "200k");
  assert.equal(shortTokens(1000000), "1M");
});

test("a plan's limits read shortest first, and a passed one leaves", () => {
  const now = 1_000_000;
  const rows = planRows({
    plan: "plus",
    windows: [
      { id: "week", minutes: 10080, used: 0.23, resetsAt: now + 120 * 60_000 },
      { id: "five", minutes: 300, used: 1.2, resetsAt: now + 30 * 60_000 },
      { id: "old", minutes: 60, used: 0.5, resetsAt: now - 1 },
    ],
  }, now);
  assert.deepEqual(rows.map((row) => row.id), ["five", "week"]);
  assert.equal(rows[0].label, "5 hour limit");
  assert.equal(rows[0].fill, 1);
  assert.equal(rows[0].near, true);
  assert.equal(rows[0].note, "Limit reached. Resets in 30 min");
  assert.equal(rows[1].used, "23% used");
  assert.equal(planRows(null, now).length, 0);
});
