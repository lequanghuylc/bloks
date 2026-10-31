import assert from "node:assert/strict";
import { test } from "node:test";

import { checkRules, outcomesOf, saidBack, speaks, startValue, type FieldInfo } from "../src/lib/genui.ts";

const select: FieldInfo = { name: "size", label: "Party size", input: { type: "Select", props: { items: [{ type: "SelectItem", props: { value: "4", label: "Four" } }] } } };
const boxes: FieldInfo = { name: "extras", label: "Extras", input: { type: "CheckBoxGroup", props: { items: [{ type: "CheckBoxItem", props: { name: "wine", label: "Wine", description: "" } }] } } };

test("a form's answer reads as the web writes it", () => {
  assert.equal(
    saidBack("Book", [select, boxes], { size: "4", extras: { wine: true } }),
    "Book\n\nParty size: Four\nExtras: Wine",
  );
  assert.equal(saidBack("", [boxes], { extras: { wine: false } }), "Extras: None");
  assert.equal(saidBack("x", [{ name: "when", label: "When", input: { type: "DatePicker" } }], { when: ["2026-01-01", "2026-01-02"] }), "x\n\nWhen: 2026-01-01 to 2026-01-02");
  assert.equal(saidBack("x", [], {}, { a: 1 }), 'x\n\n{"a":1}');
});

test("what a click does", () => {
  assert.deepEqual(outcomesOf("Yes", undefined), [{ kind: "say", words: "Yes" }]);
  assert.deepEqual(outcomesOf("Yes", { actions: [] }), [], "every step refused does nothing");
  assert.deepEqual(outcomesOf("Go", { actions: [{ action: "ToAssistant", args: ["Do it"] }] }), [{ kind: "say", words: "Do it" }]);
  assert.deepEqual(outcomesOf("Go", { actions: [{ action: "OpenUrl", args: ["https://a.b"] }] }), [{ kind: "open", url: "https://a.b" }]);
  assert.deepEqual(outcomesOf("Go", { actions: [{ action: "OpenUrl", args: ["javascript:x"] }] }), []);
  assert.deepEqual(outcomesOf("Go", { actions: [{ action: "Set", args: ["$a", 1] }, { action: "Set", args: ["$b"], dynamic: true }, { action: "Reset", args: ["$a"] }] }), [
    { kind: "set", name: "$a", value: 1 },
    { kind: "reset", names: ["$a"] },
  ]);
  assert.equal(speaks(undefined), true);
  assert.equal(speaks({ actions: [{ action: "OpenUrl", args: [] }] }), false);
});

test("rules", () => {
  assert.equal(checkRules({ required: true }, ""), "This is required");
  assert.equal(checkRules({ required: true }, { a: false }), "This is required");
  assert.equal(checkRules({ required: true }, "x"), null);
  assert.equal(checkRules({ email: true }, "nope"), "Enter an email address");
  assert.equal(checkRules({ email: true }, ""), null, "empty and not required passes");
  assert.equal(checkRules({ numeric: true, max: 5 }, "9"), "At most 5");
  assert.equal(checkRules({ min: 2 }, [1]), "At least 2");
  assert.equal(checkRules({ pattern: "^a" }, "b"), "That doesn't look right");
});

test("a field starts where its props say", () => {
  assert.deepEqual(startValue({ type: "Slider", props: { min: 3 } }, {}), [3]);
  assert.deepEqual(startValue({ type: "Slider", props: { defaultValue: [7] } }, {}), [7]);
  assert.equal(startValue({ type: "RadioGroup", props: { defaultValue: "b" } }, {}), "b");
  assert.deepEqual(startValue({ type: "CheckBoxGroup", props: { items: [{ type: "CheckBoxItem", props: { name: "x", defaultChecked: true } }] } }, {}), { x: true });
  assert.equal(startValue({ type: "Input", props: { value: { $binding: "$n" } } }, { $n: "hi" }), "hi");
});
