// The dev page and the API are two processes. Vite proxies /api so the
// browser stays on one origin. The API (server/http-guard.ts) only treats
// a loopback Host plus the dev UI origin as the person at the keyboard.
// A browser that opened Vite by a LAN or Tailscale address sends that
// address instead, and the API answers 401, "pair this device first".
//
// These headers are what the proxy should forward. A page Vite itself
// served is rewritten to the loopback dev origin. Any other Origin is
// left as it arrived, so a website cannot borrow the proxy.

const DEV_UI_ORIGIN = "http://127.0.0.1:5199";

export function devApiProxyHeaders(
  headers: { host?: string; origin?: string },
  apiHost: string,
): { host: string; origin: string } {
  const origin = headers.origin;
  if (!origin) return { host: apiHost, origin: DEV_UI_ORIGIN };
  try {
    if (new URL(origin).host === headers.host) return { host: apiHost, origin: DEV_UI_ORIGIN };
  } catch {
    // A malformed Origin is the API's to refuse. Do not launder it.
  }
  return { host: apiHost, origin };
}
