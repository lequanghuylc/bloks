// A tool call a model wrote as words instead of making it. Some models behind
// pi and other ACP engines do this, in the <tool_call><function=bash> shape, and
// the engine then ends the turn with nothing run. It is not for reading, but
// the person should know the step did not happen, so readers draw a note.
// Holds nothing from Node: the app reads it too.

const FENCE = /^\s*(```|~~~)/;

/** The last line of a leaked call that starts on this line, or -1 if none does.
 * One still being written runs to the end. */
export function leakedCallEnd(lines: readonly string[], at: number): number {
  const line = lines[at];
  const wrapped = /^\s*<tool_call>\s*$/.test(line);
  if (!wrapped && !/^\s*<function=[\w.-]*>?/.test(line)) return -1;
  if (wrapped) {
    let next = at + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (next < lines.length && !/^\s*<function=/.test(lines[next])) return -1;
  }
  const close = wrapped ? "</tool_call>" : "</function>";
  for (let j = at; j < lines.length; j++) {
    if (lines[j].includes(close)) {
      // a call closed with </function> may still have its wrapper's end after it
      return !wrapped && lines[j + 1]?.trim() === "</tool_call>" ? j + 1 : j;
    }
  }
  return lines.length - 1;
}

/** A reply without them, for somewhere that only shows words. A fence is left
 * as written, since a call shown in one was shown on purpose. */
export function withoutLeakedCalls(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let open: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(FENCE);
    if (open) {
      if (lines[i].trim() === open) open = null;
    } else if (fence) {
      open = fence[1];
    } else {
      const end = leakedCallEnd(lines, i);
      if (end >= 0) {
        i = end;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out.length === lines.length ? text : out.join("\n").trimEnd();
}
