// A finished turn folded to one line, the web's src/lib/turnFold.ts: the work
// goes under "Worked 42 sec · 3 commands", and what the person came back for
// stays. Pure, so the tests can run it.
import { isProgressText, type Message } from "./messages.ts";

export type Asker =
  | { by: "agent"; peerId: string; peerName: string }
  | { by: "telegram"; name: string }
  | { by: "routine"; name?: string }
  | { by: "watcher" }
  | { by: "webhook" }
  | { by: "intent"; name?: string }
  | { by: "goal" }
  | { by: "incident" };

export interface TurnFold {
  key: string;
  messages: Message[];
  asker: Asker | null;
  speaker?: string;
  ms: number;
  tools: string[];
  files: number;
  messaged: Array<{ peerId: string; peerName: string }>;
  replied: boolean;
}

export type Row =
  | { type: "fold"; key: string; fold: TurnFold }
  | { type: "message"; key: string; message: Message; afterAgent?: { peerName: string } }
  | { type: "exchange"; key: string; message: Message }
  | { type: "tools"; key: string; tools: Message[] }
  | { type: "quiet"; key: string; messages: Message[] }
  | { type: "taken"; key: string; message: Message };

const MACHINES = new Set(["routine", "watcher", "webhook", "goal", "intent", "incident"]);

const said = (m: Message) => m.role === "user" && m.kind === "text";
const personsWords = (m: Message) => said(m) && !m.agent && !(m.via && MACHINES.has(m.via));
const startsTurn = (m: Message) => said(m) && !m.midTurn;
const botWords = (m: Message) => m.role === "bot" && m.kind === "text" && (!m.agent || m.agent.dir === "reply") && !m.deleted && !m.quiet;

function settledCard(m: Message): boolean {
  if (m.kind === "options") return !m.card || Boolean(m.card.answered || m.card.dismissed || m.card.cutOff);
  if (m.kind === "connector") return !m.connector || m.connector.status === "connected" || m.connector.status === "dismissed";
  if (m.kind === "secret") return !m.secret || m.secret.status !== "needs-value";
  return false;
}

function tucks(m: Message): boolean {
  if (m.deleted || m.quiet || m.telegramSent) return false;
  if (m.role === "user") return said(m) && !personsWords(m);
  switch (m.kind) {
    case "text":
    case "activity":
    case "screen":
      return true;
    case "changes":
      return m.changes?.rehearsal?.state !== "pending";
    case "options":
    case "connector":
    case "secret":
      return settledCard(m);
    default:
      return false;
  }
}

function askerOf(m: Message): Asker | null {
  const telegram = m.telegramPerson ?? m.telegramGroup;
  if (telegram) return { by: "telegram", name: telegram.name + (telegram.group ? ` in ${telegram.group.title}` : "") };
  if (m.telegramDelegate) return { by: "telegram", name: m.telegramDelegate.name };
  if (m.agent?.dir === "in") return { by: "agent", peerId: m.agent.peerId, peerName: m.agent.peerName };
  if (m.via === "routine") return { by: "routine", name: m.routine?.name };
  if (m.via === "watcher") return { by: "watcher" };
  if (m.via === "webhook") return { by: "webhook" };
  if (m.via === "intent") return { by: "intent", name: m.intent?.name };
  if (m.via === "goal") return { by: "goal" };
  if (m.via === "incident") return { by: "incident" };
  return null;
}

function foldOver(all: Message[], indices: number[], o: { asker: Asker | null; speaker?: string; from: number; to: number }): TurnFold | null {
  const messages = indices.map((i) => all[i]);
  if (messages.every(settledCard)) return null;
  const tools: string[] = [];
  const messaged: TurnFold["messaged"] = [];
  let files = 0;
  let replied = false;
  for (const m of messages) {
    if (m.agent?.dir === "out") {
      if (m.agent.status === "failed" || m.agent.status === "uncertain") continue;
      if (o.asker?.by === "agent" && o.asker.peerId === m.agent.peerId) replied = true;
      else if (!messaged.some((peer) => peer.peerId === m.agent!.peerId)) messaged.push({ peerId: m.agent.peerId, peerName: m.agent.peerName });
    } else if (m.kind === "activity" && m.tool && !m.agent) {
      tools.push(m.tool.name);
    } else if (m.kind === "changes" && m.changes && m.changes.rehearsal?.state !== "discarded") {
      files += Math.max(0, m.changes.total - (m.changes.shared?.total ?? 0));
    }
  }
  return { key: messages[0].id, messages, asker: o.asker, ...(o.speaker ? { speaker: o.speaker } : {}), ms: Math.max(0, o.to - o.from), tools, files, messaged, replied };
}

const lastAt = (all: Message[], indices: number[]) => indices.reduce((latest, i) => Math.max(latest, all[i].at ?? 0), 0);

function foldsOfChat(all: Message[], running: boolean): { folds: Array<{ fold: TurnFold; before: number; indices: number[] }>; named: Set<string> } {
  const folds: Array<{ fold: TurnFold; before: number; indices: number[] }> = [];
  const named = new Set<string>();
  const turn = (a: number, b: number, onlyProgress: boolean) => {
    let h = a;
    while (h < b && startsTurn(all[h])) h++;
    const head = all.slice(a, h);
    const first = head.some((m) => personsWords(m) && !m.telegramPerson && !m.telegramDelegate && !m.telegramGroup) ? undefined : head[0];
    const asker = first ? askerOf(first) : null;
    const progress = (m: Message) => onlyProgress && isProgressText(m.codexText);
    let reply = -1;
    for (let j = h; j < b; j++) if (botWords(all[j]) && !progress(all[j])) reply = j;
    const parts: Array<{ start: number; from: number; ins: number[] }> = [{ start: a, from: all[a].at ?? 0, ins: [] }];
    for (let j = a; j < b; j++) {
      const m = all[j];
      if (j >= h && personsWords(m)) parts.push({ start: j, from: m.at ?? 0, ins: [] });
      else if (j !== reply && (onlyProgress ? progress(m) : tucks(m))) parts[parts.length - 1].ins.push(j);
    }
    let made = false;
    parts.forEach((part, k) => {
      if (!part.ins.length) return;
      const next = parts[k + 1];
      const mine = reply >= part.start && reply < (next?.start ?? b);
      const fold = foldOver(all, part.ins, {
        asker: k === 0 ? asker : null,
        from: part.from,
        to: next ? next.from : lastAt(all, mine ? [...part.ins, reply] : part.ins),
      });
      if (!fold) return;
      folds.push({ fold, indices: part.ins, before: !onlyProgress && mine && reply < part.ins[0] ? reply : part.ins[0] });
      made = true;
    });
    if (made && asker?.by === "agent") for (let j = h; j < b; j++) if (botWords(all[j])) named.add(all[j].id);
  };
  let start = 0;
  let head = true;
  for (let i = 0; i < all.length; i++) {
    if (!startsTurn(all[i])) head = false;
    else if (!head) {
      turn(start, i, false);
      start = i;
      head = true;
    }
  }
  if (start < all.length) turn(start, all.length, running);
  return { folds, named };
}

/** A room: each agent's work until somebody else spoke, the web's foldRoom. */
function foldsOfRoom(all: Message[]): { folds: Array<{ fold: TurnFold; before: number; indices: number[] }>; named: Set<string> } {
  const open = new Map<string, number[]>();
  const stretches: Array<{ from: string; all: number[] }> = [];
  const close = (except?: string) => {
    for (const [from, indices] of [...open]) {
      if (from === except) continue;
      stretches.push({ from, all: indices });
      open.delete(from);
    }
  };
  all.forEach((m, i) => {
    if (m.role === "user") {
      if (m.kind === "text") close();
      return;
    }
    if (!m.from) return;
    if (m.kind === "text" && !m.deleted) close(m.from);
    const mine = open.get(m.from);
    if (mine) mine.push(i);
    else open.set(m.from, [i]);
  });
  close();
  const folds: Array<{ fold: TurnFold; before: number; indices: number[] }> = [];
  for (const { from, all: indices } of stretches) {
    let reply = -1;
    for (const j of indices) if (botWords(all[j])) reply = j;
    const ins = indices.filter((j) => j !== reply && tucks(all[j]));
    if (!ins.length) continue;
    const fold = foldOver(all, ins, { asker: null, speaker: from, from: all[indices[0]].at ?? 0, to: lastAt(all, reply >= 0 ? [...ins, reply] : ins) });
    if (fold) folds.push({ fold, indices: ins, before: reply >= 0 && reply < ins[0] ? reply : ins[0] });
  }
  return { folds, named: new Set() };
}

/** Messages as rows, with nothing folded: a fold's own contents when open. */
export function plainRows(messages: Message[], named: ReadonlySet<string> = new Set()): Row[] {
  const rows: Row[] = [];
  for (const message of messages) {
    const last = rows[rows.length - 1];
    if (message.deleted) rows.push({ type: "taken", key: message.id, message });
    else if (message.quiet) {
      if (last?.type === "quiet") last.messages.push(message);
      else rows.push({ type: "quiet", key: message.id, messages: [message] });
    } else if (message.takeBack || (message.agent && message.agent.dir !== "reply" && (message.kind === "text" || message.kind === "activity"))) {
      rows.push({ type: "exchange", key: message.id, message });
    } else if (message.kind === "activity") {
      if (last?.type === "tools") last.tools.push(message);
      else rows.push({ type: "tools", key: message.id, tools: [message] });
    } else if (!message.card?.dismissed) {
      const after = named.has(message.id) ? undefined : message.afterAgent ?? (message.agent?.dir === "reply" ? message.agent : undefined);
      rows.push({ type: "message", key: message.id, message, ...(after ? { afterAgent: after } : {}) });
    }
  }
  return rows;
}

/** The transcript as drawn. What waits to be sent sits above the composer. */
export function rowsOf(messages: Message[], o: { running: boolean; room: boolean }): Row[] {
  const all = messages.filter((m) => !m.queued);
  const { folds, named } = o.room ? foldsOfRoom(all) : foldsOfChat(all, o.running);
  const under = new Set<number>();
  const at = new Map<number, TurnFold[]>();
  for (const { fold, before, indices } of folds) {
    for (const i of indices) under.add(i);
    at.set(before, [...(at.get(before) ?? []), fold]);
  }
  const rows: Row[] = [];
  let run: Message[] = [];
  const flush = () => {
    rows.push(...plainRows(run, named));
    run = [];
  };
  all.forEach((message, index) => {
    for (const fold of at.get(index) ?? []) {
      flush();
      rows.push({ type: "fold", key: `fold-${fold.key}`, fold });
    }
    if (!under.has(index)) run.push(message);
  });
  flush();
  return rows;
}

export function workedFor(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

const READ = /^(read|view|notebookread|read_file|cat)$/i;
const SEARCH = /^(grep|glob|ls|list|search|web_?search|websearch|webfetch|web_?fetch|find|codebase_search)$/i;
const EDIT = /^(edit|write|multiedit|multi_edit|notebookedit|create|str_replace(_editor)?|apply_patch|write_file|edit_file)$/i;
const COMMAND = /^(bash|shell|terminal|exec|run|sandbox_exec|run_shell_command|command)$/i;

export function kindOf(name: string): "command" | "read" | "search" | "edit" | "other" {
  const head = /^([\w.-]+):\s/.exec(name.trim())?.[1];
  const bare = (head ?? name.trim()).replace(/^mcp__[^_]+__/, "");
  if (COMMAND.test(bare)) return "command";
  if (READ.test(bare)) return "read";
  if (SEARCH.test(bare)) return "search";
  if (EDIT.test(bare)) return "edit";
  if (/\s/.test(bare) && !/^error:/i.test(bare)) return "command";
  return "other";
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function askerWords(asker: Asker, name?: string): string {
  switch (asker.by) {
    case "agent": return `${name ?? asker.peerName} asked`;
    case "telegram": return `Message from ${asker.name} (Telegram)`;
    case "routine": return asker.name ? `From your routine ${asker.name}` : "From your routine";
    case "watcher": return "From your watcher";
    case "webhook": return "From a webhook";
    case "intent": return asker.name ? `From your standing intent ${asker.name}` : "From your standing intent";
    case "goal": return "Toward your goal";
    case "incident": return "About something that failed";
  }
}

/** "Worked 42 sec · 3 commands", the fold's line. */
export function foldLine(fold: TurnFold, nameOf: (id: string) => string | undefined): string {
  const time = workedFor(fold.ms);
  const lead = fold.asker ? askerWords(fold.asker, fold.asker.by === "agent" ? nameOf(fold.asker.peerId) : undefined) : null;
  const words: string[] = [];
  if (lead) words.push(lead, `worked ${time}`);
  else if (fold.speaker) words.push(`${nameOf(fold.speaker) ?? "An agent"} worked ${time}`);
  else words.push(`Worked ${time}`);
  if (fold.tools.length) {
    words.push(fold.tools.every((name) => kindOf(name) === "command") ? count(fold.tools.length, "command") : count(fold.tools.length, "tool action"));
  }
  if (fold.files) words.push(count(fold.files, "file"));
  if (fold.messaged.length) words.push(`messaged ${fold.messaged.map((peer) => nameOf(peer.peerId) ?? peer.peerName).join(", ")}`);
  if (fold.replied && fold.asker?.by === "agent") words.push("replied");
  return words.join(" · ");
}

/** "Ran 3 commands, read 5 files", a run still on screen. */
export function toolSummary(names: string[]): string {
  const by = { command: 0, read: 0, search: 0, edit: 0, other: 0 };
  for (const name of names) by[kindOf(name)]++;
  const parts: string[] = [];
  if (by.command) parts.push(`ran ${count(by.command, "command")}`);
  if (by.read) parts.push(`read ${count(by.read, "file")}`);
  if (by.search) parts.push(by.search === 1 ? "searched once" : `searched ${by.search} times`);
  if (by.edit) parts.push(`edited ${count(by.edit, "file")}`);
  if (by.other) parts.push(parts.length ? `used ${count(by.other, "other tool")}` : `used ${count(by.other, "tool")}`);
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
