import { ZodError } from "zod";
import { RelayError } from "./validation";
export const noCache = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: noCache }); }
export function fail(error: unknown) {
  if (error instanceof RelayError) return Response.json({ error: error.message, retryAfterMs: error.retryAfterMs }, { status: error.status, headers: { ...noCache, ...(error.retryAfterMs ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } : {}) } });
  if (error instanceof ZodError) return json({ error: "Some fields are invalid. Check numeric ranges and required values.", fields: error.issues.map(i => i.path.join(".")) }, 400);
  console.error("Relay request failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "Encounter storage or the service is temporarily unavailable. Your local input is preserved. Please retry." }, 503);
}
export function checkId(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new RelayError("Invalid demo session.", 400); }
export async function body(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new RelayError("Cross-origin changes are not supported.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RelayError("Expected a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 60000) { await reader.cancel(); throw new RelayError("The update is too large.", 413); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RelayError("Invalid JSON request."); }
}
