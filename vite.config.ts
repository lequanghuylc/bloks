import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devApiProxyHeaders } from "./vite.dev-proxy.ts";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The OpenUI renderer's development inspector, swapped for nothing:
      // see the note in the file it points at.
      "@openuidev/devtools": fileURLToPath(new URL("./src/lib/genui/no-devtools.ts", import.meta.url)),
    },
  },
  server: {
    // Every IPv4 address: loopback, the LAN, and Tailscale. Electron
    // loads 127.0.0.1 directly, which this still accepts. Left as
    // "localhost", the name resolves to ::1 for some clients and
    // 127.0.0.1 for others, and the Electron window is one of the ones
    // that guesses wrong.
    host: "0.0.0.0",
    port: 5199,
    // Build output lives inside the repo, and watching it means every
    // package run reloads the browser mid-edit.
    watch: {
      ignored: ["**/release/**", "**/build/**", "**/dist/**", "**/electron/resources/**"],
    },
    // In development the app and the harness are two processes, so the
    // API is proxied to keep the browser on a single origin, exactly as
    // it is when packaged. The forwarded Host and Origin are rewritten
    // in vite.dev-proxy.ts: the API would otherwise read a LAN or
    // Tailscale address as an unpaired device.
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BLOKS_PORT || 8799}`,
        configure: (proxy) => {
          const apiHost = `127.0.0.1:${process.env.BLOKS_PORT || 8799}`;
          proxy.on("proxyReq", (proxyReq, req) => {
            const headers = devApiProxyHeaders(
              {
                host: req.headers.host,
                origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
              },
              apiHost,
            );
            proxyReq.setHeader("host", headers.host);
            proxyReq.setHeader("origin", headers.origin);
          });
        },
      },
    },
  },
});
