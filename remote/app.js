import { buildOrigin, parsePairLink } from "./pair-link.js";

const TOKEN_KEY = "bloks.remote.token";
const root = document.querySelector("#app");
const wideQuery = window.matchMedia("(min-width: 768px)");

let token = localStorage.getItem(TOKEN_KEY) || "";
let screen = "scan";
let draft = null;
let error = "";
let agents = [];
let rooms = [];
let messages = [];
let stick = true;
let loadingOlder = false;
let noOlder = false;
let stream = null;
let lastSeq = 0;
let stopCamera = () => {};
let cameraGen = 0;

const el = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === "className") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
};

function chatParam() {
  const raw = new URL(location.href).searchParams.get("chat") ?? "";
  const match = /^(bot|room):([\w-]+)$/.exec(raw);
  return match ? { kind: match[1], id: match[2] } : null;
}

function forget() {
  localStorage.removeItem(TOKEN_KEY);
  token = "";
  stream?.abort();
  stream = null;
  screen = "scan";
  error = "";
  agents = [];
  rooms = [];
  messages = [];
  history.replaceState({}, "", "/remote");
  render();
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text };
  }
}

async function api(path, init = {}) {
  const headers = { ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(path, { ...init, headers });
  const body = await readJson(res);
  if (res.status === 401 && token) {
    forget();
    throw new Error("This browser is no longer paired.");
  }
  if (!res.ok) throw new Error(body.error || `Could not reach the Mac (${res.status}).`);
  return body;
}

function lineOf(message) {
  if (!message) return "";
  if (message.kind === "notice") return message.phoneText || message.text || "";
  if (message.kind === "activity") return message.tool?.name || "";
  if (message.text) return message.text;
  return "";
}

function shown(message) {
  const line = lineOf(message);
  if (line) return line;
  return message.kind || "";
}

function muted(message) {
  return !lineOf(message);
}

function names() {
  return new Map(agents.map((bot) => [bot.id, bot.name]));
}

function speaker(message) {
  if (message.role === "user") return "You";
  const named = message.from && names().get(message.from);
  if (named) return named;
  const open = chatParam();
  if (open?.kind === "bot") return agents.find((bot) => bot.id === open.id)?.name || "Agent";
  return "Agent";
}

function visibleBots() {
  return agents.filter((bot) => !bot.archivedAt);
}

function visibleRooms() {
  return rooms.filter((room) => !room.archived);
}

function record(kind, id) {
  return (kind === "bot" ? agents : rooms).find((item) => item.id === id) ?? null;
}

function preview(item) {
  const list = item.messages ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const line = lineOf(list[i]);
    if (line) return line;
  }
  return "";
}

function openConfirm(parsed, credential) {
  stopCamera();
  draft = { scheme: "http", host: parsed.host, port: String(parsed.port), name: parsed.name, credential };
  error = "";
  screen = "confirm";
  render();
}

async function claim(credential) {
  let res;
  try {
    res = await fetch("/api/pair/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential, device: "Safari" }),
    });
  } catch {
    throw new Error("This Mac did not answer.");
  }
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || "Could not pair.");
  token = body.token;
  localStorage.setItem(TOKEN_KEY, token);
  history.replaceState({}, "", "/remote");
  screen = "app";
  await loadLists();
  startStream();
  render();
}

async function connect() {
  const origin = buildOrigin({ scheme: draft.scheme, host: draft.host, port: Number(draft.port) });
  if (!origin) {
    error = "That address is not valid.";
    render();
    return;
  }
  if (origin !== location.origin) {
    location.assign(`${origin}/remote#credential=${encodeURIComponent(draft.credential)}`);
    return;
  }
  try {
    await claim(draft.credential);
  } catch (err) {
    error = err.message;
    render();
  }
}

async function loadLists() {
  const [botBody, roomBody] = await Promise.all([api("/api/bots?messages=40"), api("/api/bloks?messages=40")]);
  agents = botBody.bots ?? [];
  rooms = roomBody.bloks ?? [];
  const open = chatParam();
  if (open) {
    messages = record(open.kind, open.id)?.messages ?? [];
    noOlder = false;
  }
}

function select(kind, id) {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("chat", `${kind}:${id}`);
  if (wideQuery.matches) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  messages = record(kind, id)?.messages ?? [];
  noOlder = false;
  stick = true;
  render();
}

async function loadOlder() {
  const open = chatParam();
  const oldest = messages[0];
  if (!open || !oldest || loadingOlder || noOlder) return;
  loadingOlder = true;
  const bot = open.kind === "bot" ? record("bot", open.id) : null;
  const path = open.kind === "bot"
    ? `/api/bots/${open.id}/messages?thread=${encodeURIComponent(bot?.threadId || "")}&before=${encodeURIComponent(oldest.id)}`
    : `/api/bloks/${open.id}/messages?before=${encodeURIComponent(oldest.id)}`;
  try {
    const page = await api(path);
    const earlier = page.messages ?? [];
    if (!earlier.length) noOlder = true;
    else {
      const box = document.querySelector(".transcript");
      const before = box ? box.scrollHeight : 0;
      messages = [...earlier, ...messages];
      paintTranscript();
      if (box) box.scrollTop = box.scrollHeight - before;
    }
  } catch {
    /* the transcript stays where it was */
  } finally {
    loadingOlder = false;
  }
}

function upsert(message) {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) messages[index] = message;
  else messages.push(message);
  const pending = messages.findIndex((item) => item.pending && item.text === message.text && message.role === "user");
  if (pending >= 0) messages.splice(pending, 1);
}

function applyFrame(frame) {
  if (typeof frame._seq === "number") lastSeq = frame._seq;
  if (frame.kind === "hello") {
    if (frame.resumed === false) void reload();
    return;
  }
  if (frame.kind !== "message" && frame.kind !== "message.patch") return;
  const open = chatParam();
  const thread = frame.threadId;
  if (open && threadOf(open) === thread && frame.message) {
    upsert(frame.message);
    paintTranscript();
  }
  const bot = agents.find((item) => item.threadId === thread || item.tasks?.some((task) => task.id === thread));
  const room = rooms.find((item) => item.id === thread);
  const target = bot || room;
  if (target && frame.message) {
    target.messages = [...(target.messages ?? []).filter((item) => item.id !== frame.message.id), frame.message];
    paintList();
  }
}

function threadOf(open) {
  if (open.kind === "room") return open.id;
  return record("bot", open.id)?.threadId ?? open.id;
}

async function reload() {
  try {
    await loadLists();
    paintList();
    paintTranscript();
  } catch {
    /* a 401 already returned to the scanner */
  }
}

function startStream() {
  stream?.abort();
  const control = new AbortController();
  stream = control;
  void readStream(control.signal);
}

async function readStream(signal) {
  while (!signal.aborted && token) {
    try {
      const res = await fetch(lastSeq ? `/api/events?since=${lastSeq}` : "/api/events", {
        headers: { authorization: `Bearer ${token}` },
        signal,
      });
      if (res.status === 401) return forget();
      if (!res.ok || !res.body) throw new Error("stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const data = raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
          if (!data) continue;
          try {
            applyFrame(JSON.parse(data));
          } catch {
            /* a frame that is not JSON is skipped */
          }
        }
      }
    } catch {
      if (signal.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function send(event) {
  event.preventDefault();
  const open = chatParam();
  const input = event.target.elements.text;
  const text = input.value.trim();
  if (!open || !text) return;
  input.value = "";
  messages.push({ id: `local-${Date.now()}`, role: "user", kind: "text", text, pending: true });
  stick = true;
  paintTranscript();
  const path = open.kind === "bot" ? `/api/bots/${open.id}/messages` : `/api/bloks/${open.id}/messages`;
  try {
    await api(path, { method: "POST", body: JSON.stringify({ text }) });
  } catch (err) {
    messages = messages.filter((item) => !item.pending);
    paintTranscript();
    const note = document.querySelector(".send-error");
    if (note) note.textContent = err.message;
  }
}

function paintList() {
  const box = document.querySelector(".scroll");
  if (!box) return;
  const open = chatParam();
  const group = (label, kind, items) => {
    if (!items.length) return [];
    return [
      el("div", { className: "group-label" }, label),
      ...items.map((item) => el("button", {
        className: `row${open?.kind === kind && open.id === item.id ? " selected" : ""}`,
        type: "button",
        onClick: () => select(kind, item.id),
      }, el("strong", null, item.name || "Untitled"), el("span", { className: "preview" }, preview(item)))),
    ];
  };
  const rows = [...group("Agents", "bot", visibleBots()), ...group("Rooms", "room", visibleRooms())];
  box.replaceChildren(...(rows.length ? rows : [el("p", { className: "empty" }, "No conversations yet.")]));
}

function paintTranscript() {
  const box = document.querySelector(".transcript");
  const title = document.querySelector(".chat-title");
  const open = chatParam();
  if (title) title.textContent = open ? (record(open.kind, open.id)?.name || "Conversation") : "";
  if (!box || !open) return;
  box.replaceChildren(...messages.map((message) => el("div", { className: `msg ${message.role === "user" ? "mine" : "theirs"}` },
    el("div", { className: "who" }, speaker(message)),
    el("div", { className: `bubble${muted(message) ? " muted" : ""}` }, shown(message)),
  )));
  if (stick) box.scrollTop = box.scrollHeight;
}

function renderApp() {
  document.body.classList.toggle("in-chat", Boolean(chatParam()));
  root.replaceChildren(el("div", { className: "shell" },
    el("aside", { className: "list" },
      el("div", { className: "list-head" },
        el("h1", null, "Bloks"),
        el("button", { className: "ghost", type: "button", onClick: forget }, "Disconnect"),
      ),
      el("div", { className: "scroll" }),
    ),
    el("section", { className: "chat" },
      el("div", { className: "chat-bar" },
        el("button", { className: "ghost back", type: "button", onClick: () => history.back() }, "Back"),
        el("strong", { className: "chat-title" }, ""),
      ),
      el("div", { className: "transcript", onScroll: (event) => {
        const box = event.target;
        stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        if (box.scrollTop < 40) void loadOlder();
      } }),
      el("p", { className: "empty" }, "Choose a conversation"),
      el("form", { className: "composer", onSubmit: (event) => void send(event) },
        el("input", { name: "text", placeholder: "Message", autocomplete: "off" }),
        el("button", { className: "primary", type: "submit" }, "Send"),
      ),
      el("p", { className: "send-error error" }),
    ),
  ));
  paintList();
  paintTranscript();
}

function renderScan() {
  document.body.classList.remove("in-chat");
  const video = el("video", { className: "video", playsinline: "true", muted: "true" });
  const cameraNote = el("p", { className: "hint" });
  root.replaceChildren(el("main", { className: "gate" },
    el("h1", null, "Pair"),
    el("p", { className: "lede" }, "Scan the code on your Mac."),
    video,
    cameraNote,
    error ? el("p", { className: "error" }, error) : null,
    el("form", { className: "stack", onSubmit: (event) => {
      event.preventDefault();
      const parsed = parsePairLink(new FormData(event.target).get("link"));
      if (!parsed) {
        error = "That is not a Bloks pairing code.";
        render();
        return;
      }
      openConfirm(parsed, parsed.token);
    } },
      el("label", null, "Or paste the pairing link"),
      el("textarea", { name: "link" }),
      el("button", { className: "primary", type: "submit" }, "Continue"),
    ),
    el("form", { className: "stack", onSubmit: (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const code = String(data.get("code") ?? "").trim();
      const host = String(data.get("host") ?? "").trim();
      const port = String(data.get("port") ?? "").trim();
      if (!/^\d{6}$/.test(code) || !host || !/^\d+$/.test(port)) {
        error = "Enter the six-digit code, the host, and the port.";
        render();
        return;
      }
      stopCamera();
      draft = { scheme: "http", host, port, name: "", credential: code };
      error = "";
      screen = "confirm";
      render();
    } },
      el("label", null, "Or type the code"),
      el("input", { name: "code", inputmode: "numeric", autocomplete: "off", placeholder: "123456", maxlength: "6" }),
      el("input", { name: "host", placeholder: "Host", autocomplete: "off" }),
      el("input", { name: "port", inputmode: "numeric", placeholder: "Port" }),
      el("button", { className: "primary", type: "submit" }, "Continue"),
    ),
  ));
  void startCamera(video, cameraNote);
}

async function startCamera(video, note) {
  const gen = cameraGen;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector === "undefined") {
    note.textContent = "The camera needs HTTPS. Paste the link or type the code.";
    video.remove();
    return;
  }
  let media;
  try {
    media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch {
    note.textContent = "The camera is unavailable. Paste the link or type the code.";
    video.remove();
    return;
  }
  if (gen !== cameraGen) {
    for (const track of media.getTracks()) track.stop();
    return;
  }
  let stopped = false;
  stopCamera = () => {
    stopped = true;
    for (const track of media.getTracks()) track.stop();
  };
  video.srcObject = media;
  await video.play().catch(() => {});
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const tick = async () => {
    if (stopped || screen !== "scan") return;
    try {
      const codes = await detector.detect(video);
      const raw = codes[0]?.rawValue;
      if (raw) {
        const parsed = parsePairLink(raw);
        if (parsed) {
          openConfirm(parsed, parsed.token);
          return;
        }
        note.textContent = "That QR is not a Bloks pairing code.";
      }
    } catch {
      /* the next frame tries again */
    }
    if (!stopped) setTimeout(tick, 250);
  };
  void tick();
}

function renderConfirm() {
  document.body.classList.remove("in-chat");
  root.replaceChildren(el("main", { className: "gate" },
    el("h1", null, "Connect"),
    draft.name ? el("p", { className: "lede" }, draft.name) : el("p", { className: "lede" }, "Choose where this Mac answers."),
    error ? el("p", { className: "error" }, error) : null,
    el("form", { className: "fields", onSubmit: (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      draft = { ...draft, scheme: data.get("scheme"), host: String(data.get("host") ?? ""), port: String(data.get("port") ?? "") };
      void connect();
    } },
      el("label", null, "Scheme"),
      el("select", { name: "scheme" },
        el("option", { value: "http", ...(draft.scheme === "http" ? { selected: "" } : {}) }, "http"),
        el("option", { value: "https", ...(draft.scheme === "https" ? { selected: "" } : {}) }, "https"),
      ),
      el("label", null, "Host"),
      el("input", { name: "host", value: draft.host, autocomplete: "off" }),
      el("label", null, "Port"),
      el("input", { name: "port", value: draft.port, inputmode: "numeric" }),
      el("button", { className: "primary", type: "submit" }, "Connect"),
    ),
    el("button", { className: "ghost", type: "button", onClick: () => { screen = "scan"; error = ""; render(); } }, "Back"),
  ));
}

function render() {
  cameraGen += 1;
  stopCamera();
  stopCamera = () => {};
  if (screen === "scan") renderScan();
  else if (screen === "confirm") renderConfirm();
  else renderApp();
}

wideQuery.addEventListener("change", () => {
  if (screen === "app") renderApp();
});

window.addEventListener("popstate", () => {
  if (screen !== "app") return;
  const open = chatParam();
  messages = open ? (record(open.kind, open.id)?.messages ?? []) : [];
  noOlder = false;
  renderApp();
});

async function boot() {
  const credential = new URLSearchParams(location.hash.replace(/^#/, "")).get("credential");
  if (credential) {
    root.textContent = "Connecting…";
    try {
      await claim(credential);
    } catch (err) {
      history.replaceState({}, "", "/remote");
      screen = "scan";
      error = err.message;
      render();
    }
    return;
  }
  if (token) {
    screen = "app";
    try {
      await loadLists();
      startStream();
      render();
    } catch (err) {
      if (!token) return;
      error = err.message;
      screen = "scan";
      render();
    }
    return;
  }
  render();
}

void boot();
