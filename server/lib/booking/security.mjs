import { createHash, timingSafeEqual } from "node:crypto";
import { BookingError } from "./domain.mjs";
import { digest } from "./store.mjs";
export function requireSameOrigin(request, origins) {
  if (!origins.includes(request.headers.get("origin")))
    throw new BookingError("Please submit from this website.", 403, "origin");
}
export async function readBoundedJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new BookingError("Expected JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new BookingError("Missing request.");
  let length = 0,
    chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new BookingError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let pos = 0;
  for (const part of chunks) {
    bytes.set(part, pos);
    pos += part.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BookingError("Invalid JSON.");
  }
}
export function ownerIdentity(headers, env) {
  const authorization = headers.get("authorization") || "";
  const username = env.ADMIN_USERNAME || "yuchen";
  const expected = env.ADMIN_PASSWORD_HASH || "";
  let supplied = "";
  if (authorization.startsWith("Basic ") && authorization.length < 1024) {
    supplied = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  }
  const colon = supplied.indexOf(":");
  const password = supplied.slice(colon + 1);
  const actual = createHash("sha256").update(password).digest();
  if (!/^[a-f0-9]{64}$/.test(expected) || colon < 0 || supplied.slice(0, colon) !== username || !timingSafeEqual(actual, Buffer.from(expected, "hex"))) {
    throw new BookingError("Sign in to manage your schedule.", 401);
  }
  return "owner:" + username;
}
const fromHex = (s) =>
  Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
const hex = (b) =>
  Array.from(new Uint8Array(b), (c) => c.toString(16).padStart(2, "0")).join(
    "",
  );
async function cryptoKey(key) {
  if (!/^[a-f0-9]{64}$/.test(key || ""))
    throw new Error("Encryption is not configured");
  return crypto.subtle.importKey("raw", fromHex(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return (
    hex(iv) +
    "." +
    hex(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await cryptoKey(key),
        new TextEncoder().encode(value),
      ),
    )
  );
}
export async function decrypt(value, key) {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(iv) },
      await cryptoKey(key),
      fromHex(data),
    ),
  );
}
export async function consumeState(db, state, owner, now) {
  return db
    .prepare(
      "DELETE FROM oauth_states WHERE id=? AND owner=? AND expires>? RETURNING *",
    )
    .bind(state, owner, now)
    .first();
}
export async function rateLimit(db, key, limit, windowMs, now = Date.now()) {
  const bucket = Math.floor(now / windowMs),
    id = await digest(`${key}:${bucket}`);
  const row = await db
    .prepare(
      "INSERT INTO rate_limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(id, (bucket + 1) * windowMs)
    .first();
  if (row.count > limit)
    throw new BookingError(
      "Too many requests. Please try again later.",
      429,
      "rate",
    );
}
export async function verifyCapability(booking, token) {
  return (
    typeof token === "string" &&
    token.length >= 40 &&
    token.length <= 150 &&
    !!booking &&
    booking.capHash === (await digest(token))
  );
}
