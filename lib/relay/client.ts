"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, Snapshot } from "./types";

export class ApiError extends Error { constructor(message: string, public status: number, public retryAfterMs = 0) { super(message); } }
export async function api<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  const result = await fetch(path, { method: payload === undefined ? "GET" : "POST", cache: "no-store", headers: payload === undefined ? undefined : { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload), signal });
  const value = await result.json().catch(() => ({}));
  if (!result.ok) {
    const problem = value as { error?: string; retryAfterMs?: number };
    throw new ApiError(problem.error || "The server could not save this change.", result.status, problem.retryAfterMs);
  }
  return value as T;
}
export function useRelay() {
  const [sessionId, setSessionId] = useState("");
  const [persona, setPersona] = useState("maya");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [syncError, setSyncError] = useState("");
  const initialized = useRef<Promise<string> | null>(null);
  const accept = useCallback((next: Snapshot) => {
    setSnapshot(old => !old || Date.parse(next.serverTime) >= Date.parse(old.serverTime) ? next : old);
    setSyncError("");
  }, []);
  useEffect(() => {
    let stopped = false;
    const params = new URLSearchParams(window.location.search);
    setPersona(params.get("persona") || "maya");
    if (!initialized.current) initialized.current = params.get("session") ? Promise.resolve(params.get("session")!) : api<{id:string}>("/api/sessions", {}).then(r=>r.id);
    initialized.current.then(id => { if (!stopped) { setSessionId(id); const url = new URL(window.location.href); url.searchParams.set("session",id); if (!url.searchParams.has("persona")) url.searchParams.set("persona","maya"); window.history.replaceState({},"",url); } }).catch(e => { if (!stopped) setSyncError(e.message); });
    return () => { stopped = true; };
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController(); let pending = false;
    const poll = async () => { if (pending) return; pending = true; try { accept(await api<Snapshot>("/api/sessions/"+sessionId, undefined, controller.signal)); } catch(e) { if(!controller.signal.aborted) setSyncError(e instanceof Error ? e.message : "Connection interrupted."); } finally { pending=false; } };
    void poll(); const interval = setInterval(poll,2000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [sessionId,accept]);
  const act = useCallback(async (command: Command): Promise<Snapshot> => {
    const { action, ...payload } = command;
    const next = await api<Snapshot>("/api/sessions/"+sessionId+"/"+action,payload);
    accept(next); return next;
  },[sessionId,accept]);
  const switchPersona = useCallback((id: string) => { setPersona(id); const url=new URL(window.location.href); url.searchParams.set("persona",id); window.history.replaceState({},"",url); },[]);
  return { sessionId, persona, snapshot, syncError, act, switchPersona };
}
