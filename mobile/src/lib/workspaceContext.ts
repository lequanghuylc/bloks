// A single live workspace, shared by the conversation list and the chat
// opened from it, so one instance holds one event stream however deep the
// navigation goes.
import { useEffect, useMemo, useRef, useState } from "react";

import { useInstances } from "./instances";
import { useWorkspace } from "./useWorkspace";

type Workspace = ReturnType<typeof useWorkspace>;

const live = new Map<string, Workspace>();
const watchers = new Map<string, Set<() => void>>();

/** The list screen owns the stream; it stays mounted under the chat. */
export function usePublishWorkspace(instanceId: string): Workspace {
  const { clientFor } = useInstances();
  const client = useMemo(() => clientFor(instanceId), [clientFor, instanceId]);
  const workspace = useWorkspace(client);
  live.set(instanceId, workspace);
  useEffect(() => {
    for (const notify of watchers.get(instanceId) ?? []) notify();
  });
  useEffect(() => () => {
    live.delete(instanceId);
  }, [instanceId]);
  return workspace;
}

/** The chat reads what the list screen beneath it published. */
export function useLiveWorkspace(instanceId: string): Workspace | undefined {
  const [, redraw] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const notify = () => {
      if (mounted.current) redraw((n) => n + 1);
    };
    const set = watchers.get(instanceId) ?? new Set();
    set.add(notify);
    watchers.set(instanceId, set);
    return () => {
      mounted.current = false;
      set.delete(notify);
    };
  }, [instanceId]);
  return live.get(instanceId);
}
