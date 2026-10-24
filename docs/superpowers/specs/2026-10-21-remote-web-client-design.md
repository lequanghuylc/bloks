# Remote web client

A phone-sized chat client served by the Mac at `/remote`. The Mac stays the source of truth. The page pairs with the code or QR the desktop already shows, then lists agents and rooms and talks in one conversation.

No Tailscale address, host, or port is written into the client.

## Serving

The files live in `remote/` at the repo root:

- `index.html` loads `app.css` and `app.js` as same-origin modules
- `app.js` is the page
- `app.css` is the layout
- `pair-link.js` is the pure parser and origin builder, imported by `app.js` and by tests

`node server/index.ts` reads `remote/` from the repo. `pnpm build:server` copies that directory to `dist-server/remote`, so the packaged app ships it inside the server resources it already copies. The server looks for `remote/index.html` beside the running module, then one directory up.

`GET /remote` and `GET /remote/` return `index.html`. `GET /remote/<file>` returns a file that stays inside `remote/`. A path that escapes the directory is 403. Unknown files are 404. There is no directory listing.

Responses use the existing `SECURITY_HEADERS`. Scripts are files, not inline, so `default-src 'self'` holds. The QR decoder runs in the page and does not fetch anything.

A remote browser may load these files with no bearer when phone access is on and the request is same-origin. Typing the address into the browser sends no Origin, and that counts as same-origin, which is the rule the server already uses for the phone. Every other remote path is unchanged: `GET /api/health`, `POST /api/pair/claim`, and `POST /api/pair/prove` stay open, and anything else still requires `Authorization: Bearer`. Loopback can load `/remote` as well, so the page works in development. The desktop UI, the QR contents, and the iPhone routes are not changed.

## Connect

The first screen is the scanner. It asks for the camera and reads a QR. The only QR it accepts is the one the desktop builds:

`bloks://pair?address=<host:port>&token=bloks_pair_…&code=<6 digits>&name=<computer>`

`parsePairLink` accepts that shape and nothing else. `address` is a host and port (`192.168.1.4:8799` or `[ipv6]:port`). `token` matches `bloks_pair_[A-Za-z0-9_-]{32}`. `code` is six digits. `name` is optional and display-only.

The camera is used only in a secure context (HTTPS or localhost). When the camera is missing, denied, or the page is plain HTTP, the scanner stays on screen and offers two other entries: paste the `bloks://pair` link, or type the six-digit code and an address. A bad scan or a bad paste is rejected in the page. Nothing is sent.

The next screen shows the computer name and the address, split into scheme, host, and port. The scheme starts as `http`, because the QR has no scheme. The host and port start as the QR said, or as what was typed. The person can change the host to another IP or a domain, change the port, and switch on HTTPS. No address is filled in from a constant.

Connect builds one origin with `buildOrigin`. The default ports 80 and 443 are omitted. Every other port, including 8799, is kept. The credential is the QR token when the person scanned or pasted, and the six-digit code when they typed. The device name sent to the Mac is `Safari`.

When that origin is the page's current origin, the page posts `{ "credential", "device": "Safari" }` to `/api/pair/claim`. When it is a different origin, the browser navigates to `{origin}/remote#credential=<encoded>`. The hash is not sent to the server. The page there reads the hash, claims, stores the bearer, and replaces the URL with `/remote` so the credential leaves the address bar. A refused code shows the Mac's "that code is not valid" and stays on the confirm screen. A host that does not answer shows that, and the address stays editable.

The bearer is stored in `localStorage` under `bloks.remote.token`. On a later visit the list request itself carries it. A 401 clears it and shows the scanner.

## Chat

The list is two groups, Agents and Rooms, from `GET /api/bots?messages=40` and `GET /api/bloks?messages=40`. Each row is the name and the latest text line.

The open conversation is `?chat=bot:<id>` or `?chat=room:<id>`. Refresh keeps it. The transcript is that tail, oldest at the top. Scroll up calls `GET /api/bots/:id/messages?thread=<thread>&before=<id>` or `GET /api/bloks/:id/messages?before=<id>` and prepends the page.

A `text` message shows its text. A `notice` shows `phoneText` when present, otherwise its text. An `activity` row is the tool name. Any other kind shows `text` when it has some, otherwise one muted line naming the kind. Nothing in the transcript is tappable. Message text is escaped. The image bytes of a screen message are not shown.

The composer posts `{ "text" }` to `POST /api/bots/:id/messages` or `POST /api/bloks/:id/messages`. Empty text is not sent.

`GET /api/events` stays open for the whole signed-in session, read with `fetch` so the bearer can be attached. A `message` frame whose `threadId` is on screen is appended. A `message.patch` frame replaces the row with the same id. A `hello` with `resumed: false`, or a stream that cannot resume, refetches the list and the open transcript. Other kinds are ignored. A dropped stream reconnects with `?since=` and the last `_seq`. A frame that is not JSON is skipped.

A 401 on any signed-in call clears the bearer and returns to the scanner. Disconnect, on the list, does the same in this browser only. The Mac keeps the device under Paired until it is removed there.

## Layout

The breakpoint is 768px.

Under 768px the list and the conversation are separate pages. The list is the first page after pairing. Opening a row pushes a history entry for `?chat=`. A back control, and the browser back button, return to the list. The composer sits at the bottom of the conversation.

At 768px and above the list is a left sidebar and the conversation fills the rest. Clicking a row sets `?chat=` with `replaceState`, so the back button does not step through conversations. The sidebar stays. With no `chat` parameter the main area is empty. There is no back control.

The scanner and the address screen are full-window at either width.

## Tests

`pair-link.js` is tested directly. A real `bloks://pair` link yields address, token, code, and name. Anything else, including a missing field, a short token, or a non-digit code, is rejected. `buildOrigin` turns scheme, host, and port into one origin, keeps 8799, and drops port 443 on https.

A harness test, with phone access on, fetches `GET /remote` as a remote client with no bearer and receives the HTML. `GET /api/bots` with no bearer is still 401. Claiming with the code still returns a bearer, and that bearer can read `/api/bots`. A remote request for `/remote/%2e%2e/server` does not escape the directory.

## Out of scope

Answering approval cards, opening files, the terminal, settings, and revoking the device on the Mac. Changing the QR so it prefers a Tailscale address. Serving TLS from this server. Letting some other website call the API.
