// The whole web app, for what has no native screen: settings, memory,
// routines and the rest. Only an instance that answers without a token can
// show it, since the page has nowhere to get a device's token from.
import { WebView } from "react-native-webview";

import { useInstances } from "../lib/instances";
import type { ScreenProps } from "../lib/routes";

export function WebScreen({ route }: ScreenProps<"Web">) {
  const { instances } = useInstances();
  const instance = instances.find((item) => item.id === route.params.instanceId);
  if (!instance) return null;
  return <WebView source={{ uri: instance.origin }} sharedCookiesEnabled allowsBackForwardNavigationGestures style={{ flex: 1 }} />;
}
