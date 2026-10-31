// A build for looking at the app from a Mac with no working touch, as the iOS
// 15 simulator is. Only on with EXPO_PUBLIC_E2E=1 at bundle time, which is the
// test Metro and never the one a device uses: its links open any address.
export const E2E = process.env.EXPO_PUBLIC_E2E === "1";

/** Rows to skip from the newest, to look further up a transcript. */
export const e2e = { skip: 0 };
