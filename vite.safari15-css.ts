// Safari before 15.4 ignores CSS cascade `@layer` blocks entirely.
// Tailwind v4 emits every utility inside `@layer`, so on those builds
// (iPadOS 15.0–15.3) spacing, display, sizing, and dark: variants never
// apply — wordmarks render at intrinsic PNG size and the layout collapses.
//
// `@property` initials are also ignored there; transform utilities then
// see empty customs. Re-emit those initials as plain custom properties.
//
// This must rewrite *raw CSS* before Vite wraps it as a JS module. If it
// runs after the wrap, the browser evaluates `*, ::before { … }` as
// JavaScript and Safari throws: expected expression, got '*'.
import type { Plugin } from "vite";

/** Unwrap `@layer name { … }` (nested ones too) and drop bare `@layer …;`
 * statements, preserving source order so later utilities still win. */
export function flattenCssLayers(css: string): string {
  css = css.replace(/@layer\s+[\w\s,-]+;/g, "");
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.slice(i).match(/^@layer\s+[\w-]+\s*\{/);
    if (open) {
      i += open[0].length;
      const start = i;
      let depth = 1;
      while (i < css.length && depth > 0) {
        const ch = css[i++];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      out += flattenCssLayers(css.slice(start, i - 1));
      continue;
    }
    out += css[i++];
  }
  return out;
}

/** Copy each `@property --x { initial-value: Y }` onto every element so
 * transforms still resolve when `@property` itself is unsupported. */
export function propertyInitialFallbacks(css: string): string {
  const initials = new Map<string, string>();
  const re = /@property\s+([^\s{]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const value = m[2].match(/initial-value:\s*([^;]+)/)?.[1]?.trim();
    if (value != null) initials.set(m[1], value);
  }
  if (!initials.size) return css;
  const body = [...initials].map(([name, value]) => `  ${name}: ${value};`).join("\n");
  return (
    `/* Safari < 15.4 lacks @property; plain customs keep transforms valid. */\n` +
    `*, ::before, ::after, ::backdrop {\n${body}\n}\n` +
    css
  );
}

/**
 * Tailwind v4 emits `@media (width >= 48rem)` / `(width < 48rem)`. Safari
 * only got that range syntax in 16.4, so on iPadOS 15 every `sm:`/`md:`/
 * `lg:` rule is ignored: the shell stays a column, `md:hidden` never
 * hides the chat list, and settings render under it instead of replacing it.
 */
export function legacyMediaQueries(css: string): string {
  return css.replace(
    /@media\s*\(\s*(width|height|inline-size|block-size)\s*(>=|<=|<|>)\s*([^)]+?)\s*\)/g,
    (_all, feature: string, op: string, value: string) => {
      const v = value.trim();
      // Stick to min/max-width/height: Safari 15 understands those, and
      // Tailwind's breakpoints are all `width` queries anyway.
      const horizontal = feature === "width" || feature === "inline-size";
      const minFeat = horizontal ? "min-width" : "min-height";
      const maxFeat = horizontal ? "max-width" : "max-height";
      if (op === ">=") return `@media (${minFeat}: ${v})`;
      if (op === "<=") return `@media (${maxFeat}: ${v})`;
      if (op === ">") return `@media (${minFeat}: calc(${v} + 0.02px))`;
      // width < X → max-width: just under X
      return `@media (${maxFeat}: calc(${v} - 0.02px))`;
    },
  );
}

const MIX_SUPPORT = /@supports\s*\(\s*color:\s*color-mix\(in lab,\s*red,\s*red\)\s*\)/;
/** Tailwind emits `color-mix(in oklab|srgb, ORIGIN PCT%, transparent)`. */
const ANY_MIX = /color-mix\(\s*in (?:oklab|srgb),\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)/;

/**
 * Tailwind v4's `/opacity` colors look like:
 *   color: var(--x);
 *   @supports (color: color-mix(in lab, red, red)) {
 *     color: color-mix(in oklab, var(--x) 75%, transparent);
 *   }
 * Safari before 16.2 has no color-mix, and before 15.4 can't nest
 * `@supports` inside a rule — so it keeps the solid `var(--x)` "fallback".
 * For backgrounds that is opaque white/ink washes (unreadable quotes);
 * rewrite to `color-mix(in srgb, …)` as the real value. Engines without
 * color-mix drop it and leave backgrounds transparent / text inherited,
 * which beats a solid wash.
 */
export function fixOpacityColorMix(css: string): string {
  // Nested @supports inside a utility rule.
  css = css.replace(
    /([a-z-]+):\s*([^;{}]+);\s*@supports\s*\(\s*color:\s*color-mix\(in lab,\s*red,\s*red\)\s*\)\s*\{\s*\1:\s*color-mix\(\s*in (?:oklab|srgb),\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\);\s*\}/g,
    (_all, prop: string, solid: string, origin: string, pct: string) => {
      const mix = `color-mix(in srgb, ${origin.trim()} ${pct}%, transparent)`;
      if (prop === "background-color" || prop === "background") return `${prop}: ${mix};`;
      // Text/border: keep the solid underneath so Safari 15 still paints something.
      return `${prop}: ${solid.trim()};\n    ${prop}: ${mix};`;
    },
  );

  // Sibling form used for variants (hover/active): solid rule, then a
  // top-level @supports that restates the selector with color-mix.
  css = css.replace(
    new RegExp(
      String.raw`(?:^|\n)(\s*)([^\{\}@][^{]*)\{[^{}]*?([a-z-]+):\s*([^;{}]+);\s*\}(\s*)` +
        MIX_SUPPORT.source +
        String.raw`\s*\{\s*\2\{[^{}]*?\3:\s*` +
        ANY_MIX.source +
        String.raw`\s*;\s*\}\s*\}`,
      "g",
    ),
    (_all, indent: string, selector: string, prop: string, solid: string, _gap: string, origin: string, pct: string) => {
      const mix = `color-mix(in srgb, ${origin.trim()} ${pct}%, transparent)`;
      const sel = selector.trim();
      if (prop === "background-color" || prop === "background") {
        return `\n${indent}${sel} {\n${indent}  ${prop}: ${mix};\n${indent}}`;
      }
      return `\n${indent}${sel} {\n${indent}  ${prop}: ${solid.trim()};\n${indent}  ${prop}: ${mix};\n${indent}}`;
    },
  );

  // Any remaining oklab mixes → srgb (Safari understands srgb mixes earlier
  // than oklab when color-mix exists at all).
  css = css.replace(/color-mix\(\s*in oklab,/g, "color-mix(in srgb,");
  return css;
}

function isCssRequest(id: string): boolean {
  return /\.css(?:\?|$)/.test(id) || id.includes("&lang.css");
}

/** Vite (or HMR) has already turned the stylesheet into a module. */
function isJsWrappedCss(code: string): boolean {
  return /^\s*import\b/.test(code) || code.includes("createHotContext") || code.includes("__vite__");
}

export function safari15Css(): Plugin {
  return {
    name: "bloks-safari15-css",
    // Same stage as @tailwindcss/vite:generate (enforce: "pre"). Registered
    // after it in vite.config.ts so we see the expanded utilities, still as
    // CSS, before Vite wraps the file as a JS module.
    enforce: "pre",
    transform: {
      filter: { id: /\.css(?:\?.*)?$/ },
      handler(code, id) {
        if (!isCssRequest(id) || isJsWrappedCss(code)) return;
        if (
          !code.includes("@layer") &&
          !code.includes("@property") &&
          !/\(.*(?:width|height)\s*[<>]=?/.test(code) &&
          !code.includes("color-mix")
        ) {
          return;
        }
        return fixOpacityColorMix(legacyMediaQueries(propertyInitialFallbacks(flattenCssLayers(code))));
      },
    },
  };
}
