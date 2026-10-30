import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixOpacityColorMix,
  flattenCssLayers,
  legacyMediaQueries,
  propertyInitialFallbacks,
} from "../vite.safari15-css.ts";

test("flattenCssLayers unwraps Tailwind layers so Safari < 15.4 can see utilities", () => {
  const css = `@layer properties;
@layer theme, base, utilities;
@layer theme {
  :root { --spacing: 0.25rem; }
}
@layer utilities {
  .h-12 { height: calc(var(--spacing) * 12); }
  .hidden { display: none; }
}`;
  const out = flattenCssLayers(css);
  assert.equal(/@layer/.test(out), false);
  assert.match(out, /--spacing:\s*0\.25rem/);
  assert.match(out, /\.hidden\s*\{\s*display:\s*none/);
  assert.match(out, /\.h-12\s*\{/);
});

test("propertyInitialFallbacks re-emits @property initials as plain customs", () => {
  const css = `@property --tw-scale-x {
  syntax: "*";
  inherits: false;
  initial-value: 1;
}
.scale-9 { scale: var(--tw-scale-x); }`;
  const out = propertyInitialFallbacks(css);
  assert.match(out, /\*\s*,\s*::before[\s\S]*--tw-scale-x:\s*1/);
  assert.match(out, /@property --tw-scale-x/);
});

test("legacyMediaQueries rewrites Tailwind range syntax for Safari < 16.4", () => {
  const css = `@media (width >= 48rem) {
  .md\\:flex { display: flex; }
  .md\\:hidden { display: none; }
}
@media (width < 48rem) {
  .max-md\\:block { display: block; }
}`;
  const out = legacyMediaQueries(css);
  assert.match(out, /@media \(min-width: 48rem\)/);
  assert.match(out, /@media \(max-width: calc\(48rem - 0\.02px\)\)/);
  assert.doesNotMatch(out, /width\s*>=/);
  assert.doesNotMatch(out, /width\s*</);
});

test("fixOpacityColorMix drops solid bg fallbacks that wash out Safari 15", () => {
  const nested = `.bg-foreground\\/\\[0\\.06\\] {
    background-color: var(--foreground);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in srgb, var(--foreground) 6%, transparent);
    }
  }
  .text-current\\/75 {
    color: currentcolor;
    @supports (color: color-mix(in lab, red, red)) {
      color: color-mix(in oklab, currentcolor 75%, transparent);
    }
  }`;
  const out = fixOpacityColorMix(nested);
  assert.match(out, /\.bg-foreground\\\/\\\[0\\.06\\\] \{\s*background-color: color-mix\(in srgb, var\(--foreground\) 6%, transparent\);/);
  assert.doesNotMatch(out, /\.bg-foreground[\s\S]*background-color:\s*var\(--foreground\);/);
  assert.match(out, /color: currentcolor;\s*color: color-mix\(in srgb, currentcolor 75%, transparent\);/);
  assert.doesNotMatch(out, /@supports \(color: color-mix/);
});

test("fixOpacityColorMix rewrites sibling hover opacity utilities", () => {
  const sibling = `.hover\\:bg-accent\\/60:hover {
      background-color: var(--accent);
    }
    @supports (color: color-mix(in lab, red, red)) {
      .hover\\:bg-accent\\/60:hover {
        background-color: color-mix(in oklab, var(--accent) 60%, transparent);
      }
    }`;
  const out = fixOpacityColorMix(sibling);
  assert.match(out, /background-color: color-mix\(in srgb, var\(--accent\) 60%, transparent\);/);
  assert.doesNotMatch(out, /background-color:\s*var\(--accent\);/);
  assert.doesNotMatch(out, /@supports \(color: color-mix/);
});
