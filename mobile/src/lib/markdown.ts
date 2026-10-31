// What agents write, read into blocks the way the web reads it
// (src/lib/proseBlocks.ts, src/lib/markdownTable.ts): a reading of intent, not
// a CommonMark parser. Pure, so the tests can run it.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic" | "strike"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "code"; lang: string; code: string }
  | { kind: "ui"; fence: number | null; source: string; closed: boolean }
  | { kind: "table"; head: string[]; align: Array<"left" | "right" | "center">; rows: string[][] }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] };

export interface ListItem {
  text: string;
  task: boolean | null;
  children: Block[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)[^`]*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+•]|\d{1,9}[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const isOpenUi = (lang: string) => lang === "openui" || lang === "openui-lang";
const indentOf = (lead: string) => lead.replace(/\t/g, "    ").length;

function cellsOf(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function readList(lines: string[], from: number): { block: Extract<Block, { kind: "list" }>; next: number } {
  const first = ITEM.exec(lines[from])!;
  const base = indentOf(first[1]);
  const marker = first[2];
  const ordered = /\d/.test(marker);
  const items: ListItem[] = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let n = i + 1;
      while (n < lines.length && !lines[n].trim()) n++;
      const again = n < lines.length ? ITEM.exec(lines[n]) : null;
      if (again && indentOf(again[1]) >= base) {
        i = n;
        continue;
      }
      break;
    }
    const item = ITEM.exec(line);
    if (item) {
      const indent = indentOf(item[1]);
      if (indent < base) break;
      if (indent >= base + 2 && items.length) {
        const nested = readList(lines, i);
        items[items.length - 1].children.push(nested.block);
        i = nested.next;
        continue;
      }
      if (/\d/.test(item[2]) !== ordered) break;
      const task = TASK.exec(item[3]);
      items.push(task ? { text: task[2], task: task[1] !== " ", children: [] } : { text: item[3], task: null, children: [] });
      i++;
      continue;
    }
    // indented text carries the item on; a plain line ends the list
    if (/^\s{2,}\S/.test(line) && items.length) {
      items[items.length - 1].text += `\n${line.trim()}`;
      i++;
      continue;
    }
    break;
  }
  return { block: { kind: "list", ordered, start: ordered ? parseInt(marker, 10) : 1, items }, next: i };
}

/**
 * A reply as blocks. A fence is counted the way the server counts it, so each
 * openui block finds its entry in message.ui (server/genui-library.ts). A
 * fence glued onto the end of a sentence is not one to the server, so it has
 * no entry (fence null), and is cut away from the words rather than shown.
 */
export function parseBlocks(input: string): Block[] {
  const text = input.replace(/\r\n/g, "\n").replace(/([^\n`~])(```|~~~)(openui(?:-lang)?)(?=\s*\n)/g, "$1\n\u0000$2$3");
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let fences = 0;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const glued = lines[i].startsWith("\u0000");
    const line = glued ? lines[i].slice(1) : lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1];
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === marker) {
          closed = true;
          break;
        }
        body.push(lines[j]);
      }
      if (isOpenUi(fence[2])) {
        blocks.push({ kind: "ui", fence: glued ? null : fences, source: body.join("\n"), closed });
        if (!glued) fences++;
      } else {
        blocks.push({ kind: "code", lang: fence[2], code: body.join("\n") });
      }
      i = j;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && DIVIDER.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cellsOf(line);
      if (cellsOf(lines[i + 1]).length === head.length) {
        flush();
        const align = cellsOf(lines[i + 1]).map((cell) => (cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left") as "left" | "right" | "center");
        const rows: string[][] = [];
        let j = i + 2;
        for (; j < lines.length && lines[j].includes("|") && lines[j].trim(); j++) rows.push(cellsOf(lines[j]));
        blocks.push({ kind: "table", head, align, rows });
        i = j - 1;
        continue;
      }
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const said: string[] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const quoted = QUOTE.exec(lines[j]);
        if (!quoted) break;
        said.push(quoted[1]);
      }
      blocks.push({ kind: "quote", text: said.join("\n") });
      i = j - 1;
      continue;
    }
    if (ITEM.test(line)) {
      flush();
      const list = readList(lines, i);
      blocks.push(list.block);
      i = list.next - 1;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([^_\n]+?)__|~~([\s\S]+?)~~|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])|(?<![\w_])_(?!\s)([^_\n]+?)_(?![\w_])|\b(https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?'"])/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ kind: "text", text: rest.slice(0, match.index) });
    if (match[2] !== undefined) out.push({ kind: "code", text: match[2].trim() });
    else if (match[3] !== undefined) out.push({ kind: "bold", children: parseInline(match[3]) });
    else if (match[4] !== undefined) out.push({ kind: "bold", children: parseInline(match[4]) });
    else if (match[5] !== undefined) out.push({ kind: "strike", children: parseInline(match[5]) });
    else if (match[6] !== undefined) out.push({ kind: "link", href: match[7], children: parseInline(match[6]) });
    else if (match[8] !== undefined) out.push({ kind: "italic", children: parseInline(match[8]) });
    else if (match[9] !== undefined) out.push({ kind: "italic", children: parseInline(match[9]) });
    else out.push({ kind: "link", href: match[10], children: [{ kind: "text", text: match[10] }] });
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

/** An address that may be opened: http or https, and nothing else. */
export function safeHttpUrl(url: unknown): string | null {
  return typeof url === "string" && /^https?:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : null;
}

/** A fence with no tree, drawn as its readable words, never its source
 * (docs/GENERATIVE_UI.md, "On the iPhone"). */
export function readableWords(source: string): string {
  const words: string[] = [];
  for (const match of source.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const said = match[1].replace(/\\n/g, " ").replace(/\\(.)/g, "$1").trim();
    if (/\s/.test(said) || /[A-Z]/.test(said[0] ?? "")) words.push(said);
  }
  return words.join("\n\n");
}
