import { env } from "cloudflare:workers";
import { createEncounter } from "./catalog";
import type { EncounterState, Snapshot, Telemetry, TelemetryFrame } from "./types";
import { RelayError } from "./validation";

function db(): D1Database {
  if (!env.DB) throw new RelayError("Encounter storage is unavailable. Please retry after the database is connected.", 503);
  return env.DB;
}
export function setting(key: "GEMINI_API_KEY" | "GEMINI_MODEL" | "GEMINI_MIN_INTERVAL_MS" | "GEMINI_RPM_LIMIT" | "GEMINI_RPD_LIMIT" | "ARDUINO_DEMO_KEY"): string {
  return env[key] || process.env[key] || "";
}
export function configuration() {
  return { liveAvailable: Boolean(setting("GEMINI_API_KEY")), model: setting("GEMINI_MODEL") || "gemini-3.8-flash", minIntervalMs: Math.max(15000, Number(setting("GEMINI_MIN_INTERVAL_MS")) || 15000) };
}
export async function createSession(): Promise<EncounterState> {
  const state = createEncounter(crypto.randomUUID());
  await db().prepare("INSERT INTO relay_sessions (id,body,version,created_at) VALUES (?,?,1,?)").bind(state.id, JSON.stringify(state), state.createdAt).run();
  return state;
}
export async function readSession(id: string): Promise<{ state: EncounterState; version: number }> {
  const row = await db().prepare("SELECT body,version FROM relay_sessions WHERE id = ?").bind(id).first<{ body: string; version: number }>();
  if (!row) throw new RelayError("This demo session was not found. Start a new session from Relay’s home page.", 404);
  const state = JSON.parse(row.body) as EncounterState;
  // Older sessions predate the optional reported blood-type field.
  state.bloodTypeReported ??= null;
  return { state, version: row.version };
}
export async function mutateSession(id: string, change: (state: EncounterState) => void): Promise<EncounterState> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { state, version } = await readSession(id);
    change(state);
    state.events = state.events.slice(-300);
    const result = await db().prepare("UPDATE relay_sessions SET body = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING id")
      .bind(JSON.stringify(state), id, version).first();
    if (result) return state;
  }
  throw new RelayError("Another update is being saved. Please retry; your input has been preserved.", 409);
}
export async function snapshot(id: string): Promise<Snapshot> {
  const [session, motion] = await Promise.all([
    readSession(id), db().prepare("SELECT body FROM relay_telemetry WHERE session_id = ?").bind(id).first<{ body: string }>(),
  ]);
  return { encounter: session.state, telemetry: motion ? JSON.parse(motion.body) as Telemetry : null, config: configuration(), serverTime: new Date().toISOString() };
}
export async function saveTelemetry(id: string, frame: TelemetryFrame) {
  const reading = { ...frame, receivedAt: new Date().toISOString() };
  await db().prepare("INSERT INTO relay_telemetry (session_id,body) VALUES (?,?) ON CONFLICT(session_id) DO UPDATE SET body = excluded.body")
    .bind(id, JSON.stringify(reading)).run();
}
export async function clearTelemetry(id: string) {
  await db().prepare("DELETE FROM relay_telemetry WHERE session_id = ?").bind(id).run();
}
export async function takeModelQuota() {
  const now = Date.now();
  // A site-wide budget prevents anonymous demo sessions from multiplying API use.
  const limits: [string, number, number][] = [
    ["minute:" + Math.floor(now / 60000), Math.max(1, Number(setting("GEMINI_RPM_LIMIT")) || 8), 60000 - now % 60000],
    ["day:" + Math.floor(now / 86400000), Math.max(1, Number(setting("GEMINI_RPD_LIMIT")) || 150), 86400000 - now % 86400000],
  ];
  for (const [key, limit, retry] of limits) {
    const ok = await db().prepare("INSERT INTO relay_quota (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count")
      .bind(key, limit).first();
    if (!ok) throw new RelayError("The demo’s model request budget has been reached. Manual updates and approved tasks remain available.", 429, retry);
  }
}
