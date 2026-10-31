# Bloks mobile (Expo)

An iPhone and iPad client for Bloks. One app connects to any number of Bloks
instances, one per computer or workspace. It runs either in Expo Go, loaded
from this computer, or as its own installed app.

## Install it as its own app

This is the way onto a device whose App Store Expo Go no longer opens SDK 54.
The app carries its own code, so it needs no Metro, and SDK 54 keeps running
from iOS 15.1 up. It needs a paid Apple Developer account, and the Apple login
is typed by you when the build asks.

Sign in, then register each device by opening the link this prints on it and
installing the profile it offers:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest device:create
```

Send the current code to the `main` channel, so the build does not pick up an
older update published there:

```bash
npx eas-cli@latest update --branch main --platform ios --message "What changed"
```

Build. It runs on EAS, so this computer's Xcode does not matter:

```bash
npx eas-cli@latest build --profile adhoc --platform ios
```

Open the link it gives you on the device. From iOS 16, turn on Developer Mode
under Settings, Privacy & Security, which ad hoc apps require, and restart when
asked. A device registered later needs a new build, with
`--refresh-ad-hoc-provisioning-profile` if the build runs non-interactively.

Later code changes reach an installed app with the `update` command above. A
new native module or a change to `app.json` needs a new build.

## Run it in Expo Go

```bash
npm install
```

On the same wifi as the computer running this:

```bash
npm start
```

Or over Tailscale, from anywhere on your tailnet:

```bash
npm run tailscale
```

Open it in an Expo Go that supports SDK 54 by scanning the QR code with the
Camera. The computer running this must stay on and reachable, since Expo Go
loads the app from it. Instances you add are remembered between runs.

The App Store only offers the latest Expo Go, which may have moved past SDK 54.
An iPad on iOS 15 keeps the last version it can run. If yours will not open
this project, install the app as above.

## Published to Expo

The project is `@cdvn/bloks-mobile`. Expo Go only opens a published project for
a signed-in member of its account, a rule Expo applies to every project since
May 2026. On a device that cannot sign in, such as iOS 15 where the login
browser is no longer supported, use `npm start` or `npm run tailscale` above
instead: the app then comes from this computer and needs no account.

On a device signed in as `cdvn`, it is listed under Projects, with no computer
serving it. Or open it directly:

```
exp://u.expo.dev/058504d7-e040-4e2e-af95-877e2b899dfe?channel-name=main&runtime-version=exposdk:54.0.0
```

Published code does not change on its own. To send what is in this folder to
phones, with `EXPO_TOKEN` set:

```bash
npx eas-cli@latest update --branch main --platform ios --message "What changed"
```

## Why SDK 54

Do not upgrade the Expo SDK without reading this.

| | Runs on |
| --- | --- |
| SDK 54 | iOS 15.1+ |
| SDK 55 | iOS 15.1+ |
| SDK 56 and later | iOS 16.4+ |

SDK 56 would drop iOS 15, and the iPad's Expo Go only opens SDK 54. iOS 15.0
itself cannot run it: Expo Go refuses to install below 15.1.

## Add an instance

Press **Add** and enter a local network IP, a Tailscale IP or name, or a
domain. With no port, 8799 and then 5199 are tried.

| Port | What answers | Access |
| --- | --- | --- |
| 8799 | The Bloks API, packaged or dev | Paired: a six digit code or QR from Settings, Phone and devices |
| 5199 | `pnpm dev` | No token. The API's dev proxy treats every caller as the owner |

To turn on port 8799 for the network, press **Pair a phone** on that computer
and restart Bloks when it asks. Tokens are kept in the iOS keychain.

The QR names the computer's LAN address. Off that network, type its Tailscale
address and the six digits instead.

## Plain http

Plain `http://` works in Expo Go, which allows it for every project.
`app.json` sets the same for the installed app.

- **Tailscale:** private, because WireGuard encrypts underneath.
- **LAN:** not encrypted. Messages and the device's token can be read by
  others on that network.
- **Port 5199:** needs no token at all, so anyone who can reach it controls
  that Bloks. Keep it to networks you trust.

iOS asks once for Local Network access for Expo Go. Allow it, or LAN addresses
will not answer. If it was declined, turn it on in the iOS Settings app under
Expo Go.

## What is native

Instances and their status, agents and rooms, conversations and lanes, live
streaming replies, approvals and question cards, stop, photo attachments, and
loading earlier messages. From 700 points wide, such as an iPad, conversations
and settings show as a list beside the page.

Each agent's chat changes its engine, model and effort, and shows its context
and usage, under the message box. Settings has connection, general, about you,
engines, agent settings, new agents, behaviour, devices and about.

Replies are drawn as the web draws them: markdown with tables, generated
answers from `message.ui` (every shape in `docs/GENERATIVE_UI.md`, including
charts and forms), finished turns folded to "Worked 42 sec · 3 commands", and
messages between agents as compact rows. Not here yet: the turn Timeline,
message actions such as copy and react, Undo on changed files, the older
` ```bloks ` gallery cards, agent mascots (an initial stands in), and opening a
saved file.

Approval modes can be read but not changed here: the web asks for Touch ID
before giving an agent more freedom, and that belongs at the computer.

Everything else in the web app, such as memory, routines and the other
settings pages, is under **Full app**, which shows the web page. It appears only on instances
that answer without a token, which today means port 5199. A paired instance
has no way to hand its token to that page.

The event stream runs only while the app is open, and this client has no push
notifications, so a waiting approval shows when you next open the app.

## Look at it from a Mac

The iOS 15 simulator has no working touch, and Expo Go's binary does not run on
its 15.0 runtime. To see the screens anyway, run the web renderer with the test
flag and open `http://localhost:8083/e2e?fixture=1`, which draws every shape:

```bash
EXPO_PUBLIC_E2E=1 EXPO_OFFLINE=1 npx expo start --web --port 8083
```

A chat saved as `public/e2e-name.json` opens at `/e2e?chat=e2e-name`. Those
files are ignored by git, and the flag is never set for a device.

## Check

```bash
npm run typecheck
```

```bash
npm test
```
