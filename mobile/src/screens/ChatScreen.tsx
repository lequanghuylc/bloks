import { useCallback, useLayoutEffect } from "react";

import { ChatPane } from "../components/ChatPane";
import type { ScreenProps } from "../lib/routes";

export function ChatScreen({ navigation, route }: ScreenProps<"Chat">) {
  const { instanceId, kind, id, name } = route.params;
  useLayoutEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);
  const onUnpaired = useCallback(() => navigation.popTo("Instances"), [navigation]);
  return <ChatPane key={`${kind}:${id}`} instanceId={instanceId} kind={kind} id={id} name={name} onUnpaired={onUnpaired} />;
}
