// The desktop QR is a bloks://pair link. The phone page reads it and
// then lets the person change the host before claiming.

const TOKEN = /^bloks_pair_[A-Za-z0-9_-]{32}$/;

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Host and port from the QR's address field. The host has no brackets. */
function splitHostPort(address) {
  if (typeof address !== "string" || !address) return null;
  if (address.startsWith("[")) {
    const end = address.indexOf("]");
    if (end <= 1) return null;
    const rest = address.slice(end + 1);
    if (!rest.startsWith(":")) return null;
    const port = Number(rest.slice(1));
    if (!validPort(port) || rest.slice(1) !== String(port)) return null;
    return { host: address.slice(1, end), port };
  }
  const colon = address.lastIndexOf(":");
  if (colon <= 0) return null;
  const host = address.slice(0, colon);
  const port = Number(address.slice(colon + 1));
  if (!host || host.includes(":") || !validPort(port) || address.slice(colon + 1) !== String(port)) return null;
  return { host, port };
}

/**
 * A desktop pairing link, or null. `name` is "" when the QR left it out.
 * @param {string} text
 */
export function parsePairLink(text) {
  let url;
  try {
    url = new URL(String(text ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "bloks:" || url.hostname !== "pair") return null;
  const address = url.searchParams.get("address") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const where = splitHostPort(address);
  if (!where || !TOKEN.test(token) || !/^\d{6}$/.test(code)) return null;
  return { address, host: where.host, port: where.port, token, code, name: url.searchParams.get("name") ?? "" };
}

/**
 * The origin the page will claim against. Default ports are omitted.
 * @param {{ scheme: string, host: string, port: number }} parts
 * @returns {string | null}
 */
export function buildOrigin({ scheme, host, port }) {
  if (scheme !== "http" && scheme !== "https") return null;
  const clean = String(host ?? "").trim();
  if (!clean || clean.includes("/") || clean.includes(" ") || clean.startsWith("[") || clean.endsWith("]")) return null;
  const p = Number(port);
  if (!validPort(p)) return null;
  const named = clean.includes(":") ? `[${clean}]` : clean;
  const drop = (scheme === "https" && p === 443) || (scheme === "http" && p === 80);
  return `${scheme}://${named}${drop ? "" : `:${p}`}`;
}
