import assert from "node:assert/strict";
import { test } from "node:test";

import { parseBlocks, parseInline, readableWords, safeHttpUrl } from "../src/lib/markdown.ts";

test("blocks are read as a reader sees them", () => {
  const blocks = parseBlocks("# Title\n\nOne\nline two\n\n- a\n  - nested\n- [x] done\n\n1. first\n2. second\n\n> said\n\n---\n\n```js\nx\n```");
  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph", "list", "list", "quote", "rule", "code"]);
  const list = blocks[2];
  assert.ok(list.kind === "list");
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].children.length, 1);
  assert.equal(list.items[1].task, true);
  assert.equal(blocks[3].kind === "list" && blocks[3].ordered, true);
});

test("a table keeps its alignment and escaped pipes", () => {
  const [table] = parseBlocks("| A | B |\n|:--|--:|\n| 1 | x\\|y |\n| 2 | z |\n\nafter");
  assert.ok(table.kind === "table");
  assert.deepEqual(table.head, ["A", "B"]);
  assert.deepEqual(table.align, ["left", "right"]);
  assert.deepEqual(table.rows, [["1", "x|y"], ["2", "z"]]);
});

test("openui fences are counted as the server counts them", () => {
  const blocks = parseBlocks("a\n\n```js\nx\n```\n\n```openui\nroot = Card([])\n```\n\nb\n\n~~~openui-lang\nroot = Card([])\n~~~");
  assert.deepEqual(blocks.filter((block) => block.kind === "ui").map((block) => block.kind === "ui" && block.fence), [0, 1]);
});

test("a fence glued to a sentence is no fence to the server, and no source shows", () => {
  const blocks = parseBlocks('Let me look.```openui\nroot = Card([h])\nh = CardHeader("Hanoi weather")\n```');
  assert.equal(blocks[0].kind, "paragraph");
  assert.equal(blocks[0].kind === "paragraph" && blocks[0].text, "Let me look.");
  assert.ok(blocks[1].kind === "ui");
  assert.equal(blocks[1].fence, null);
  assert.equal(readableWords(blocks[1].source), "Hanoi weather");
});

test("an unclosed fence runs to the end", () => {
  const [ui] = parseBlocks("```openui\nroot = Card(");
  assert.ok(ui.kind === "ui");
  assert.equal(ui.closed, false);
});

test("inline marks", () => {
  assert.deepEqual(parseInline("a **b** `c` [d](https://e.f) *g* https://h.i/j."), [
    { kind: "text", text: "a " },
    { kind: "bold", children: [{ kind: "text", text: "b" }] },
    { kind: "text", text: " " },
    { kind: "code", text: "c" },
    { kind: "text", text: " " },
    { kind: "link", href: "https://e.f", children: [{ kind: "text", text: "d" }] },
    { kind: "text", text: " " },
    { kind: "italic", children: [{ kind: "text", text: "g" }] },
    { kind: "text", text: " " },
    { kind: "link", href: "https://h.i/j", children: [{ kind: "text", text: "https://h.i/j" }] },
    { kind: "text", text: "." },
  ]);
  assert.deepEqual(parseInline("snake_case_name and 2*3*4"), [{ kind: "text", text: "snake_case_name and 2*3*4" }]);
});

test("only http and https open", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("file:///etc/passwd"), null);
  assert.equal(safeHttpUrl("https://a.b/c"), "https://a.b/c");
});
