// The conversation as the server sends it, and the rules the web client
// (src/state/reducer.ts) applies to it. Pure, so the tests can run it.

export interface OptionCard {
  title: string;
  subtitle?: string;
  options: string[];
  answered?: string;
  answeredBy?: string;
  cutOff?: boolean;
  closed?: string;
  dismissed?: boolean;
  requestId?: string;
  tool?: string;
  runId?: string;
  team?: unknown;
  appWatch?: unknown;
  open?: { path?: string };
  settingsProposal?: unknown;
}

export interface Message {
  id: string;
  role: "user" | "bot" | string;
  kind?: string;
  text?: string;
  phoneText?: string;
  from?: string;
  at?: number;
  card?: OptionCard;
  tool?: { name: string; command?: string; ok?: boolean; stopped?: boolean };
  artifact?: { name: string; mime?: string; size?: number };
  png?: string;
  mime?: string;
  queued?: boolean;
  deleted?: boolean;
  quiet?: boolean;
  pending?: boolean;
  codexText?: unknown;
  /** Generated interface, one entry per openui fence (docs/GENERATIVE_UI.md). */
  ui?: UiEntry[];
  agent?: { dir: "in" | "out" | "reply"; peerId: string; peerName: string; status?: string };
  afterAgent?: { peerId: string; peerName: string };
  takeBack?: { peerId: string; peerName: string };
  midTurn?: boolean;
  recalled?: Array<{ kind?: string; where?: string; who?: string; text?: string }>;
  via?: string;
  routine?: { name?: string };
  intent?: { name?: string };
  event?: unknown;
  compaction?: unknown;
  sessionReset?: unknown;
  imported?: string;
  incident?: { kind?: string };
  failing?: unknown;
  goal?: string;
  telegramPerson?: { name: string; group?: { title: string } };
  telegramDelegate?: { name: string };
  telegramGroup?: { name: string; group: { title: string } };
  telegramSent?: unknown;
  author?: string;
  changes?: {
    total: number;
    files: Array<{ path: string; status: string; added?: number; removed?: number; shared?: boolean }>;
    shared?: { total: number };
    rehearsal?: { state?: string };
  };
  connector?: { status?: string; name?: string };
  secret?: { status?: string; name?: string };
  component?: Record<string, unknown>;
}

export type UiValue = string | number | boolean | null | UiValue[] | { [key: string]: UiValue };
export interface UiNode {
  type: string;
  props?: Record<string, UiValue>;
}
export interface UiEntry {
  fence: number;
  tree: UiNode;
  state?: Record<string, UiValue>;
  truncated?: boolean;
}

export interface Lane {
  id: string;
  title: string;
  state?: "working" | "needs-you" | "idle";
  unread?: boolean;
  usage?: { input: number; output: number; turns: number };
  context?: LaneContext;
}

/** How full a lane is, as the server sends it (src/lib/contextCard.ts). */
export interface LaneContext {
  used: number;
  limit: number;
  fraction: number;
  measured?: boolean;
  window?: "engine" | "table";
  modelLimit?: number;
  limitApproximate?: boolean;
  summarised?: boolean;
}

export interface ModelSelection {
  instanceId: string;
  model: string;
}

export interface Bot {
  id: string;
  threadId: string;
  name: string;
  title?: string;
  description?: string;
  color?: string;
  modelSelection?: ModelSelection;
  effort?: string | null;
  approvals?: string;
  notifications?: boolean;
  unread?: boolean;
  busy?: boolean;
  hidden?: boolean;
  archivedAt?: number;
  activeTaskId?: string;
  tasks?: Lane[];
  messages?: Message[];
}

export interface Room {
  id: string;
  name: string;
  archived?: boolean;
  memberIds?: string[];
  messages?: Message[];
}

/** The web's isApproval (src/lib/cardAnswer.ts). */
export function isApproval(card: OptionCard): boolean {
  return Boolean(card.requestId) && (Boolean(card.tool) || card.title === "Approval needed");
}

/** Cards answered through a route of their own, drawn only on the computer. */
export function answersElsewhere(card: OptionCard): boolean {
  return Boolean(card.team || card.appWatch || card.open || card.settingsProposal);
}

export function cardIsOpen(card: OptionCard): boolean {
  return !card.answered && !card.dismissed && !card.closed && !card.cutOff;
}

/** The route and body that answer a card, the web's sendCardAnswer. */
export function cardAnswerRequest(
  card: OptionCard,
  answer: string,
  place: { botId: string; messageId: string; roomId?: string; taskId?: string },
): { path: string; body: Record<string, unknown>; thenMark?: string } {
  if (card.runId) return { path: `/api/workflows/runs/${card.runId}/answer`, body: { answer } };
  if (card.requestId) {
    const behavior = answer === "Allow" ? "allow" : answer === "Deny" ? "deny" : "answer";
    return {
      path: `/api/bots/${place.botId}/respond`,
      body: { requestId: card.requestId, behavior, ...(behavior === "answer" ? { message: answer } : {}) },
    };
  }
  if (place.roomId) return { path: `/api/bloks/${place.roomId}/messages`, body: { text: answer } };
  return {
    path: `/api/bots/${place.botId}/messages`,
    body: { text: answer, ...(place.taskId ? { taskId: place.taskId } : {}) },
    thenMark: `/api/bots/${place.botId}/cards/${place.messageId}`,
  };
}

export function lineOf(message: Message | undefined): string {
  if (!message) return "";
  if (message.kind === "notice") return message.phoneText || message.text || "";
  if (message.kind === "activity") return message.tool?.name || "";
  if (message.kind === "options") return message.card?.title || "";
  if (message.kind === "artifact") return message.artifact?.name || "";
  return message.text || "";
}

/** A list row reads the words around an answer drawn as interface, never its
 * source, which is for the agent and not the person. */
export function withoutGenerated(text: string): string {
  return text.replace(/(?:```|~~~)openui(?:-lang)?\b[\s\S]*?(?:```|~~~|$)/g, " ");
}

export function previewOf(messages: Message[] | undefined): string {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const message = messages![i];
    if (message.deleted || message.quiet || message.kind === "activity") continue;
    const line = lineOf(message);
    if (line) return withoutGenerated(line).replace(/\s+/g, " ").trim();
  }
  return "";
}

/** A frame's message put into a transcript: replaced where it is, or added
 * at the end. A patch marked moved went from waiting into the conversation,
 * so it leaves its old place. An optimistic copy gives way to the real one. */
export function upsert(list: Message[], message: Message, moved = false): Message[] {
  const without = message.role === "user"
    ? list.filter((item) => !(item.pending && item.text === message.text))
    : list;
  const index = without.findIndex((item) => item.id === message.id);
  if (index === -1) return [...without, message];
  if (moved) return [...without.slice(0, index), ...without.slice(index + 1), message];
  const next = without.slice();
  next[index] = message;
  return next;
}

/** Whether streamed text is an engine's progress note rather than the reply
 * (src/lib/codexProgress.ts). */
export function isProgressText(c: unknown): boolean {
  const t = c as { v?: number; origin?: string; phase?: string; questions?: string; display?: string } | null | undefined;
  return Boolean(t && t.v === 1 && t.origin === "agent" && t.phase === "commentary" && t.questions === "none" && t.display === "progress");
}

/** Pulls whole SSE frames out of a buffer; what is left waits for more. */
export function takeFrames(buffer: string): { frames: unknown[]; rest: string } {
  const frames: unknown[] = [];
  let rest = buffer;
  let split: number;
  while ((split = rest.indexOf("\n\n")) >= 0) {
    const raw = rest.slice(0, split);
    rest = rest.slice(split + 2);
    const data = raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data) continue;
    try {
      frames.push(JSON.parse(data));
    } catch {
      // a frame that is not JSON is skipped
    }
  }
  return { frames, rest };
}

/** The attached picture's block in the prompt (src/lib/attachments.ts). */
export function composeOutgoing(text: string, imagePaths: string[]): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
  return [text.trim(), ...imagePaths.map((path) => `<attached-image path="${escape(path)}" />`)].filter(Boolean).join("\n\n");
}

/** What the person's message carried, as the web's bubble draws it: pictures,
 * file chips and pasted text, with the words apart. */
export function readSent(text: string): { words: string; images: string[]; files: string[]; pastes: number } {
  const images: string[] = [];
  const files: string[] = [];
  let pastes = 0;
  const unescape = (value: string) =>
    value.replace(/&#10;/g, "\n").replace(/&#13;/g, "\r").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const words = text
    .replace(/<attached-image path="([^"]*)" \/>/g, (_all, path: string) => {
      images.push(unescape(path));
      return "";
    })
    .replace(/<attached-file path="([^"]*)" \/>/g, (_all, path: string) => {
      files.push(unescape(path));
      return "";
    })
    .replace(/<pasted-text>[\s\S]*?<\/pasted-text>/g, () => {
      pastes += 1;
      return "";
    })
    .trim();
  return { words, images, files, pastes };
}

export const baseName = (path: string) => path.split("/").pop() ?? path;
