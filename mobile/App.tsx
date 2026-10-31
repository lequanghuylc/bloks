import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useThemeChoice } from "./src/lib/appearance";
import { E2EBridge, navigationRef } from "./src/components/E2EBridge";
import { E2E } from "./src/lib/e2e";
import { InstancesProvider } from "./src/lib/instances";
import type { Stack as Routes } from "./src/lib/routes";
import { AddInstanceScreen } from "./src/screens/AddInstanceScreen";
import { FixtureScreen } from "./src/screens/FixtureScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ConversationsScreen } from "./src/screens/ConversationsScreen";
import { InstancesScreen } from "./src/screens/InstancesScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { WebScreen } from "./src/screens/WebScreen";

const Stack = createNativeStackNavigator<Routes>();

export default function App() {
  const dark = useColorScheme() === "dark";
  useThemeChoice();
  return (
    <SafeAreaProvider>
      <InstancesProvider>
        <NavigationContainer ref={navigationRef} theme={dark ? DarkTheme : DefaultTheme}>
          <Stack.Navigator>
            <Stack.Screen name="Instances" component={InstancesScreen} options={{ title: "Bloks" }} />
            <Stack.Screen name="AddInstance" component={AddInstanceScreen} options={{ title: "Add instance", presentation: "modal" }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ title: "Scan the code" }} />
            <Stack.Screen name="Conversations" component={ConversationsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            {E2E && <Stack.Screen name="Fixture" component={FixtureScreen} options={{ title: "Every shape" }} />}
            <Stack.Screen name="Web" component={WebScreen} options={{ title: "Full app" }} />
          </Stack.Navigator>
        </NavigationContainer>
        {E2E && <E2EBridge />}
      </InstancesProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
