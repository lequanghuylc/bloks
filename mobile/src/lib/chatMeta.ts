// What the web says around a message: when it was said, what waits, what the
// agent is doing and what can be done with it. Pure, so the tests can run it.
// Sources: src/lib/when.ts, src/lib/transcript.ts, src/lib/tool-summary.ts,
// src/lib/redo.ts, src/components/WaitingStrip.tsx, MessageActions.tsx.
import type { Message } from "./messages.ts";
import { kindOf } from "./turnFold.ts";

export type ReplyDraft = { id?: string; author: string; excerpt: string };

export const QUICK_REACTIONS = ["👍", "🎉", "👀", "❤️", "😂", "🤔"];
export const REPLY_HOLD_MS = 2000;

/** The time alone today; the date too once the day is not today, and the year
 * once the year is not this one. */
export function stamp(at: number | undefined, now = Date.now(), locale?: string): string {
  if (!at) return "";
  const date = new Date(at);
  const today = new Date(now);
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(locale, time);
  const day: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...time };
  return date.toLocaleString(locale, date.getFullYear() === today.getFullYear() ? day : { ...day, year: "numeric" });
}

/** "8s", "1m 05s", "1h 02m": fixed width within each unit, so it does not jitter. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

export function excerptOf(message: Message): string {
  return (message.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

/** A transcript split as the web splits it: said, and waiting to be said. */
export function splitWaiting(messages: readonly Message[]): { said: Message[]; waiting: Message[] } {
  const said: Message[] = [];
  const waiting: Message[] = [];
  for (const m of messages) {
    if (!m.queued && !m.unsent) said.push(m);
    else if (!m.deleted) waiting.push(m);
  }
  return { said, waiting };
}

/** Who queued a message, or null for you: then it is yours to change. */
export function waitingSender(m: Message): string | null {
  const person = m.telegramPerson ?? m.telegramGroup;
  if (person) return person.group ? `${person.name} in ${person.group.title} (Telegram)` : `${person.name} (Telegram)`;
  if (m.telegramDelegate) return `${m.telegramDelegate.name} (Telegram)`;
  if (m.agent?.dir === "in") return m.agent.peerName;
  switch (m.via) {
    case "watcher":
      return "your watcher";
    case "intent":
      return m.intent?.name ? `your standing intent ${m.intent.name}` : "your standing intent";
    case "webhook":
      return "a webhook";
    case "email":
      return "email";
    case "goal":
      return "your goal";
    case "incident":
      return "Bloks, about something that failed";
    case "routine":
      return m.routine?.name ? `your routine ${m.routine.name}` : "your routine";
    default:
      return null;
  }
}

export function waitingStatus(m: Message, working: boolean, editing = false, now = Date.now()): string {
  const time = stamp(m.queuedAt ?? m.at, now);
  if (m.unsent) return "Not sent. Bloks restarted before it could go.";
  if (editing) return "Queued, waits until you save or cancel";
  if (m.waitsFor === "restart") return `Queued at ${time}, sends after Bloks restarts`;
  if (m.waitsFor === "pause") {
    return m.waitsUntil ? `Queued at ${time}, sends when the pause ends at ${stamp(m.waitsUntil, now)}` : `Queued at ${time}, sends when the pause ends`;
  }
  if (!working) return `Queued at ${time}`;
  if (m.delivery?.route === "queued" && m.delivery.line) return `${m.delivery.line}, queued at ${time}`;
  return `Queued at ${time}, sends when this reply finishes`;
}

export function waitingTitle(waiting: readonly Message[]): string {
  const unsent = waiting.filter((m) => m.unsent).length;
  if (unsent === waiting.length) return unsent === 1 ? "A message didn't send." : `${unsent} messages didn't send.`;
  return waiting.length === 1 ? "A message is waiting to send." : `${waiting.length} messages are waiting to send.`;
}

/** When the running turn began, as the transcript tells it. */
export function turnStartedAt(messages: readonly Message[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.kind === "text" && !m.midTurn && !m.queued && !m.unsent) return m.at ?? null;
  }
  return null;
}

/** Whether the working line is owed. A reply just arrived holds it off for a
 * moment, then lets it back if the agent is plainly still at work. */
export function workingLineOwed(working: boolean, streaming: string, last: Message | undefined, replyAgeMs: number): boolean {
  if (!working) return false;
  if (streaming || !last) return true;
  if (last.role === "bot" && last.kind === "text" && !last.deleted) return replyAgeMs >= REPLY_HOLD_MS;
  return true;
}

const TESTS = /(^|[\s;&|/(])(test|tests|vitest|jest|pytest|mocha|rspec|playwright|go test|cargo test)(\s|$|\))/i;
const INSTALL = /\b(npm|pnpm|yarn|bun|pip3?|brew|gem|poetry|uv|cargo)\s+(i|install|add|ci)\b/i;
const BUILD = /(^|[\s;&|/(])(build|tsc|make|compile)(\s|$|\))/i;

const NAMED: Record<string, string> = {
  websearch: "Searching the web",
  web_search: "Searching the web",
  webfetch: "Reading a web page",
  web_fetch: "Reading a web page",
  open_url: "Opening a web page",
  ls: "Looking through files",
  list: "Looking through files",
  write: "Writing a file",
  create: "Writing a file",
  write_file: "Writing a file",
  todowrite: "Planning",
  task: "Handing work to a helper",
  agent: "Handing work to a helper",
  ask_user: "Waiting for your answer",
  memory_read: "Checking its memory",
  memory_write: "Saving to memory",
  search_history: "Looking back through messages",
  read_message: "Looking back through messages",
};

function commandWords(command: string): string {
  if (TESTS.test(command)) return "Running tests";
  if (INSTALL.test(command)) return "Installing packages";
  if (BUILD.test(command)) return "Building";
  return "Running a command";
}

/** What a call is doing in plain words, or null when not worth a guess. */
export function stepWords(tool: { name: string; command?: string }): string | null {
  const name = tool.name.trim();
  const peer = /^messaged (.+)$/.exec(name);
  if (peer) return `Messaging ${peer[1]}`;
  const labelled = /^([\w.-]+):\s(.*)$/s.exec(name);
  const bare = (labelled ? labelled[1] : name).replace(/^mcp__[^_]+__/, "");
  const named = NAMED[bare.toLowerCase()];
  if (named) return named;
  switch (kindOf(bare)) {
    case "command":
      return commandWords(tool.command ?? labelled?.[2] ?? name);
    case "read":
      return "Reading a file";
    case "search":
      return "Searching the files";
    case "edit":
      return "Editing a file";
    default:
      return null;
  }
}

/** The line's words: only a call from this turn names the step, so one a crash
 * left open earlier never says what the agent is doing now. */
export function workingStep(messages: readonly Message[], streaming: string): string {
  if (streaming) return "Writing";
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].kind === "text") {
      start = i + 1;
      break;
    }
  }
  for (let i = messages.length - 1; i >= start; i--) {
    const tool = messages[i].tool;
    if (tool && tool.ok === undefined && !tool.stopped) return stepWords(tool) ?? "Working";
  }
  return "Working";
}

export type RedoOffer = { offered: true; messages: number; files: number; working?: boolean; filesElsewhere?: string; resend: number; sent?: boolean };
export type RedoPreview = { offered: false; why?: string } | RedoOffer;

/** What redoing takes back, said before it is pressed. */
export function redoLine(offer: RedoOffer, agent: string): string {
  const messages = offer.messages === 1 ? "1 message" : `${offer.messages} messages`;
  const files = offer.files === 1 ? "1 file" : `${offer.files} files`;
  const takes = offer.working
    ? offer.filesElsewhere
      ? `Stops ${agent} and removes ${messages}.`
      : `Stops ${agent}, removes ${messages} and undoes its file changes.`
    : offer.files > 0
      ? `Removes ${messages} and restores ${files}.`
      : `Removes ${messages}.`;
  return [
    takes,
    offer.filesElsewhere ? `Files it changed ${offer.filesElsewhere} stay as they are.` : "",
    offer.resend > 1 ? `Resends your ${offer.resend} messages.` : "",
    offer.sent ? "Messages it sent, and anything outside the folder, stay." : "",
  ].filter(Boolean).join(" ");
}

/** What can be done with a message, in the web's order: an agent's words are a
 * record, so only your own can be edited or rewound to. A room has neither. */
export type ActionKey = "copy" | "reply" | "forward" | "edit" | "rewind" | "delete";
export function actionsFor(message: Message, room: boolean): ActionKey[] {
  if (!message.text || message.deleted || message.pending) return [];
  const mine = message.role === "user";
  const fixed = mine && !room;
  return [
    "copy",
    "reply",
    "forward",
    ...(fixed && message.via !== "goal" && message.via !== "incident" ? (["edit"] as const) : []),
    ...(fixed ? (["rewind"] as const) : []),
    "delete",
  ];
}

/** Where the server keeps a file an agent shared. The name is one segment, so
 * a folder in it cannot be read as more of the route (src/lib/sharedFile.ts). */
export function artifactPath(botId: string, name: string): string {
  return `/api/bots/${botId}/artifacts/${encodeURIComponent(name)}`;
}

/** Whether an image view can draw this file. It cannot draw an SVG. */
export function opensAsPicture(mime: string | undefined, name: string): boolean {
  if (mime?.startsWith("image/svg") || /\.svg$/i.test(name)) return false;
  return mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(name);
}
