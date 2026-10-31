// Engines, models and usage, the way the web's pickers read them
// (src/lib/effort.ts, src/lib/contextCard.ts). Pure, so the tests can run it.
import type { LaneContext, ModelSelection } from "./messages.ts";

export interface EngineModel {
  id: string;
  label?: string;
  efforts?: string[];
}

export interface Engine {
  instanceId: string;
  driverKind?: string;
  displayName: string;
  enabled?: boolean;
  snapshot?: { state?: string; version?: string; authenticated?: boolean; message?: string };
  models: { default?: string; options: EngineModel[]; acceptsAnyId?: boolean };
  efforts?: string[];
}

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const EFFORT_NAMES: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const BEFORE_LEVELS = ["low", "medium", "high"];

export function effortName(effort: string | null | undefined): string {
  return effort ? EFFORT_NAMES[effort] ?? effort : "";
}

export const usableEngine = (engine: Engine) => engine.snapshot?.state === "available";

/** The levels an engine and model take, the web's effortLevels. */
export function effortLevels(engine: Engine | undefined, model?: string): string[] {
  if (!engine) return [];
  const levels = engine.efforts ?? BEFORE_LEVELS;
  const own = engine.models.options.find((option) => option.id === (model || engine.models.default))?.efforts;
  return EFFORTS.filter((level) => levels.includes(level) && (!own || own.includes(level)));
}

/** The level turns are really sent at: the nearest the engine has. */
export function clampEffort(wanted: string | null | undefined, levels: readonly string[]): string | undefined {
  const at = EFFORTS.indexOf(wanted as (typeof EFFORTS)[number]);
  if (at === -1 || !levels.length) return undefined;
  if (levels.includes(wanted as string)) return wanted as string;
  let nearest: string | undefined;
  for (const level of EFFORTS) {
    if (!levels.includes(level)) continue;
    if (nearest === undefined || Math.abs(EFFORTS.indexOf(level) - at) < Math.abs(EFFORTS.indexOf(nearest as (typeof EFFORTS)[number]) - at)) nearest = level;
  }
  return nearest;
}

const ACRONYMS = new Set(["gpt", "glm", "llm", "ai", "api", "xl"]);

/** A model id said as a name, the web's readableId. */
export function readableId(id: string): string {
  const bare = id.split("/").pop() || id;
  const joined = bare.replace(/(\d)[-_](\d)(?!\d{3,})/g, "$1.$2");
  const words = joined.split(/[-_\s]+/).filter((word, index, all) => word && !(index === all.length - 1 && index > 0 && /^\d{8}$/.test(word)));
  if (!words.length) return id;
  return words.map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : /^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
}

export function modelLabel(engine: Engine | undefined, model: string | undefined): string {
  const chosen = model || engine?.models.default || "";
  if (!chosen) return engine?.displayName ?? "Choose a model";
  const label = engine?.models.options.find((option) => option.id === chosen)?.label;
  return label && label !== chosen ? label : readableId(chosen);
}

/** The composer's words for what a chat runs on. */
export function selectionLabel(engines: Engine[], selection: ModelSelection | undefined): string {
  if (!selection) return "Choose a model";
  const engine = engines.find((item) => item.instanceId === selection.instanceId);
  if (!engine) return selection.model ? readableId(selection.model) : selection.instanceId;
  return modelLabel(engine, selection.model);
}

/** An engine that is not usable says why, as the web's list does. */
export function engineStatus(engine: Engine): string {
  const state = engine.snapshot?.state;
  if (state === "available") return engine.snapshot?.authenticated === false ? "Signed out" : "Ready";
  if (engine.enabled === false) return "Turned off";
  if (state === "unavailable" || state === "missing") return "Not available";
  return engine.snapshot?.message || state || "Not ready";
}

export function shortTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Only a reading the server vouches for, made by the engine and model the
 * conversation is on now: no figure rather than a guess. */
export function measuredContext(context: LaneContext | undefined): LaneContext | null {
  return context?.measured === true && context.limit > 0 ? context : null;
}

export function contextPercent(context: LaneContext): number {
  return Math.round(Math.max(0, context.fraction) * 100);
}

export interface PlanWindow {
  id: string;
  minutes: number | null;
  used: number;
  resetsAt: number | null;
  status?: "warning" | "rejected";
}

export interface PlanUsage {
  windows: PlanWindow[];
  plan: string | null;
}

export function planWindowLabel(window: Pick<PlanWindow, "minutes">): string {
  const minutes = window.minutes;
  if (!minutes || minutes <= 0) return "Limit";
  if (minutes < 60) return `${minutes} minute limit`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hour limit`;
  if (minutes === 24 * 60) return "Daily limit";
  if (minutes === 7 * 24 * 60) return "Weekly limit";
  return `${Math.round(minutes / (24 * 60))} day limit`;
}

export function resetPhrase(resetsAt: number | null, now: number): string | null {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= now) return null;
  const minutes = Math.ceil((resetsAt - now) / 60_000);
  if (minutes < 60) return `Resets in ${minutes} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `Resets in ${hours} h ${minutes % 60} min` : `Resets in ${hours} h`;
  }
  return `Resets in ${Math.ceil(minutes / (24 * 60))} days`;
}

export interface PlanRow {
  id: string;
  label: string;
  used: string;
  fill: number;
  note: string | null;
  near: boolean;
}

export function planRows(plan: PlanUsage | null | undefined, now: number): PlanRow[] {
  if (!plan || !Array.isArray(plan.windows)) return [];
  return plan.windows
    .filter((window) => Number.isFinite(window.used) && window.used >= 0 && (window.resetsAt === null || window.resetsAt > now))
    .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity))
    .map((window) => {
      const out = window.status === "rejected" || window.used >= 1;
      const state = out ? "Limit reached" : window.status === "warning" ? "Near the limit" : null;
      const reset = resetPhrase(window.resetsAt, now);
      return {
        id: window.id,
        label: planWindowLabel(window),
        used: `${Math.round(window.used * 100)}% used`,
        fill: Math.max(0, Math.min(1, window.used)),
        note: [state, reset].filter(Boolean).join(". ") || null,
        near: out || window.status === "warning",
      };
    });
}
