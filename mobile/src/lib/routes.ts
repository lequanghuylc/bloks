import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { SettingsPageId } from "../screens/SettingsScreen";

export type Stack = {
  Instances: undefined;
  /** instanceId: pair an instance again, keeping its place in the list. */
  AddInstance: { instanceId?: string; scanned?: string } | undefined;
  Scan: undefined;
  Conversations: { instanceId: string; open?: { kind: "bot" | "room"; id: string; name: string } };
  Chat: { instanceId: string; kind: "bot" | "room"; id: string; name: string };
  /** Only in a test build (src/lib/e2e.ts). */
  Fixture: undefined;
  Web: { instanceId: string };
  /** page: one page pushed on a narrow screen. */
  Settings: { instanceId: string; page?: SettingsPageId };
};

export type ScreenProps<Name extends keyof Stack> = NativeStackScreenProps<Stack, Name>;
