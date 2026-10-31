import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { parsePairLink } from "../lib/address.ts";
import type { ScreenProps } from "../lib/routes";
import { useColors } from "../lib/theme";

export function ScanScreen({ navigation }: ScreenProps<"Scan">) {
  const colors = useColors();
  const [permission, ask] = useCameraPermissions();
  const done = useRef(false);

  if (!permission?.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, fontSize: 16, textAlign: "center" }}>The camera reads the pairing code on your computer.</Text>
        <Pressable accessibilityRole="button" onPress={() => void ask()} style={[styles.button, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: "600" }}>Allow the camera</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={({ data }) => {
        if (done.current || !parsePairLink(data)) return;
        done.current = true;
        navigation.popTo("AddInstance", { scanned: data });
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  button: { minHeight: 48, paddingHorizontal: 22, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
