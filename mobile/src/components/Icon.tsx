// The few line icons the chat needs, the same Lucide shapes the web draws.
import Svg, { Circle, Path } from "react-native-svg";

const PATHS = {
  copy: ["M8 8h12v12H8z", "M16 8V4H4v12h4"],
  reply: ["M20 18v-2a4 4 0 0 0-4-4H4", "M9 17l-5-5 5-5"],
  forward: ["M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1z", "M21.9 2.1 10.9 13.1"],
  edit: ["M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 22l5-1.3a2 2 0 0 0 .8-.5z", "M15 5l4 4"],
  rewind: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  delete: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  up: ["M12 19V5", "M5 12l7-7 7 7"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  check: ["M20 6 9 17l-5-5"],
  clock: ["M12 6v6l4 2"],
} as const;

export type IconName = keyof typeof PATHS | "more";

export function Icon({ name, size = 16, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {name === "more" ? (
        <>
          <Circle cx={5} cy={12} r={1.5} fill={color} />
          <Circle cx={12} cy={12} r={1.5} fill={color} />
          <Circle cx={19} cy={12} r={1.5} fill={color} />
        </>
      ) : (
        <>
          {name === "clock" && <Circle cx={12} cy={12} r={9.5} />}
          {PATHS[name].map((d) => <Path key={d} d={d} />)}
        </>
      )}
    </Svg>
  );
}
