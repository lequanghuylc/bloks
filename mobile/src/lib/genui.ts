// Reading the tree a generated answer is stored as, and what a click does
// (src/lib/genui/actions.ts, src/components/genui/forms.tsx). Pure, so the
// tests can run it.
import { safeHttpUrl } from "./markdown.ts";
import type { UiNode, UiValue } from "./messages.ts";

export const isNode = (value: unknown): value is UiNode =>
  typeof value === "object" && value !== null && typeof (value as UiNode).type === "string";

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
export const nodes = (value: unknown, type?: string): UiNode[] => list(value).filter((item): item is UiNode => isNode(item) && (!type || item.type === type));

export type Step =
  | { action: "ToAssistant"; args?: UiValue[] }
  | { action: "OpenUrl"; args?: UiValue[] }
  | { action: "Set"; args?: UiValue[]; dynamic?: boolean }
  | { action: "Reset"; args?: UiValue[] };

export const stepsOf = (action: unknown): Step[] | null => {
  const steps = (action as { actions?: unknown } | null | undefined)?.actions;
  return Array.isArray(steps) ? (steps as Step[]) : null;
};

/** A click with no action says its label back. */
export const speaks = (action: unknown) => {
  const steps = stepsOf(action);
  return !steps || steps.some((step) => step.action === "ToAssistant");
};

export const opensPage = (action: unknown) => stepsOf(action)?.[0]?.action === "OpenUrl";

export interface FieldInfo {
  name: string;
  label: string;
  input: UiNode;
}

export const MAX_SAID = 4000;

function humane(name: string): string {
  const words = name.replace(/^\$/, "").replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : name;
}

function optionLabel(input: UiNode, value: string): string | undefined {
  const items = nodes(input.props?.items);
  const hit = items.find((item) => item.props?.value === value || item.props?.name === value);
  return hit ? text(hit.props?.label) || undefined : undefined;
}

function readable(field: FieldInfo, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return optionLabel(field.input, value) ?? value;
  if (Array.isArray(value)) {
    const parts = value.map((item) => (typeof item === "string" ? optionLabel(field.input, item) ?? item : String(item))).filter(Boolean);
    if (!parts.length) return null;
    return parts.length === 2 ? `${parts[0]} to ${parts[1]}` : parts.join(", ");
  }
  if (typeof value === "object") {
    const ticked = Object.entries(value as Record<string, unknown>)
      .filter(([, on]) => on === true)
      .map(([key]) => optionLabel(field.input, key) ?? humane(key));
    return ticked.length ? ticked.join(", ") : "None";
  }
  return null;
}

/** The web's saidBack: the message, one line a field, then any context. */
export function saidBack(message: string, fields: FieldInfo[], values: Record<string, unknown>, context?: unknown): string {
  const lines = fields.flatMap((field) => {
    const said = readable(field, values[field.name]);
    return said === null ? [] : [`${field.label || humane(field.name)}: ${said}`];
  });
  const extra = context === undefined || context === null || context === "" ? "" : typeof context === "string" ? context.trim() : JSON.stringify(context);
  const words = [message.trim(), lines.join("\n"), extra.slice(0, 500)].filter(Boolean).join("\n\n");
  return words.length > MAX_SAID ? `${words.slice(0, MAX_SAID - 1)}…` : words;
}

export type Outcome = { kind: "say"; words: string } | { kind: "open"; url: string } | { kind: "set"; name: string; value: UiValue } | { kind: "reset"; names: string[] };

/** What one click does, in order. An action with no steps does nothing. */
export function outcomesOf(label: string, action: unknown, fields: FieldInfo[] = [], values: Record<string, unknown> = {}): Outcome[] {
  const steps = stepsOf(action);
  if (!steps) {
    const words = saidBack(label, fields, values);
    return words ? [{ kind: "say", words }] : [];
  }
  const out: Outcome[] = [];
  for (const step of steps) {
    const args = step.args ?? [];
    if (step.action === "ToAssistant") {
      const words = saidBack(text(args[0]) || label, fields, values, args[1]);
      if (words) out.push({ kind: "say", words });
    } else if (step.action === "OpenUrl") {
      const url = safeHttpUrl(args[0]);
      if (url) out.push({ kind: "open", url });
    } else if (step.action === "Set") {
      if (!(step as { dynamic?: boolean }).dynamic && typeof args[0] === "string") out.push({ kind: "set", name: args[0], value: args[1] ?? null });
    } else if (step.action === "Reset") {
      out.push({ kind: "reset", names: args.filter((arg): arg is string => typeof arg === "string") });
    }
  }
  return out;
}

export interface Rules {
  required?: boolean;
  email?: boolean;
  url?: boolean;
  numeric?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && value !== null && !Array.isArray(value) && !Object.values(value).some(Boolean));

/** What is wrong with a field's value, in words, or null. */
export function checkRules(rules: Rules | undefined, value: unknown): string | null {
  if (!rules) return null;
  if (isEmpty(value)) return rules.required ? "This is required" : null;
  const said = typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
  if (said !== null) {
    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(said)) return "Enter an email address";
    if (rules.url && !/^https?:\/\/\S+$/i.test(said)) return "Enter a web address";
    if (rules.numeric && !Number.isFinite(Number(said))) return "Enter a number";
    if (rules.minLength !== undefined && said.length < rules.minLength) return `At least ${rules.minLength} characters`;
    if (rules.maxLength !== undefined && said.length > rules.maxLength) return `At most ${rules.maxLength} characters`;
    if (rules.pattern) {
      try {
        if (!new RegExp(rules.pattern).test(said)) return "That doesn't look right";
      } catch {
        // a pattern that does not compile checks nothing
      }
    }
  }
  const number = typeof value === "number" ? value : Array.isArray(value) && typeof value[0] === "number" ? value[0] : rules.numeric && said !== null ? Number(said) : null;
  if (number !== null) {
    if (rules.min !== undefined && number < rules.min) return `At least ${rules.min}`;
    if (rules.max !== undefined && number > rules.max) return `At most ${rules.max}`;
  }
  return null;
}

/** A field's value before anyone touches it. */
export function startValue(input: UiNode, state: Record<string, UiValue>): unknown {
  const props = input.props ?? {};
  const bound = (props.value as { $binding?: string } | undefined)?.$binding;
  if (bound && bound in state) return state[bound];
  if (props.value !== undefined && !bound) return props.value;
  if (input.type === "RadioGroup") return props.defaultValue ?? "";
  if (input.type === "Slider") return Array.isArray(props.defaultValue) ? props.defaultValue : [typeof props.min === "number" ? props.min : 0];
  if (input.type === "CheckBoxGroup") {
    const out: Record<string, boolean> = {};
    for (const item of nodes(props.items)) if (typeof item.props?.name === "string") out[item.props.name] = item.props.defaultChecked === true;
    return out;
  }
  return input.type === "DatePicker" && props.mode === "range" ? ["", ""] : "";
}
