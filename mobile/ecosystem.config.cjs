// Keeps Metro up so a device that cannot sign in to Expo Go can load the app
// from this computer, at exp://100.79.84.27:8081. The address is this Mac's
// Tailscale IP, and the app's files name it, so a device needs Tailscale on.
module.exports = {
  apps: [
    {
      name: "bloks-mobile-metro",
      cwd: __dirname,
      script: "node_modules/expo/bin/cli",
      args: "start --port 8081",
      interpreter: "node",
      autorestart: true,
      restart_delay: 3000,
      env: {
        REACT_NATIVE_PACKAGER_HOSTNAME: "100.79.84.27",
        // Expo Go asks for a signed manifest, and signing wants a login that
        // pm2 has no terminal to prompt for. Offline, the manifest goes unsigned.
        EXPO_OFFLINE: "1",
      },
    },
  ],
};
