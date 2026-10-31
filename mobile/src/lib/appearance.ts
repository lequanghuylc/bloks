// Light, dark or the system's, kept on this device.
import { useEffect, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "bloks.theme";

function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === "system" ? null : choice);
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((saved) => {
      if (saved === "light" || saved === "dark") {
        setChoice(saved);
        apply(saved);
      }
    }).catch(() => {});
  }, []);
  return [choice, (next) => {
    setChoice(next);
    apply(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }];
}
