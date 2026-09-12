"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Radio, Truck, Users, ShieldCheck, Sparkles, Play, RotateCcw, Link2, Clock3, ClipboardList, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import { ApiError, useRelay } from "@/lib/relay/client";
import { PEOPLE } from "@/lib/relay/catalog";
import type { Command, Snapshot } from "@/lib/relay/types";
import { Observations, Glossary } from "./observations";
import { NotesEditor } from "./notes-editor";
import { HandoffPanel } from "./handoff-panel";
import { CoordinationPanel, Resources, StaffAssignments } from "./team-panels";
import { TelemetryPanel } from "./telemetry-panel";

export default function RelayDashboard() {
  const { sessionId, persona, snapshot, syncError, act, switchPersona } = useRelay();
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"gemini" | "rehearsal" | null>(null);
  const [pauseUntil, setPauseUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [showAllEvents, setShowAllEvents] = useState(false);
  const latest = useRef<Snapshot | null>(snapshot); latest.current = snapshot;
  const latestPersona = useRef(persona); latestPersona.current = persona;
  const attempted = useRef("");
  const state = snapshot?.encounter;
  const person = state?.people.find(p => p.id === persona) || PEOPLE[0];
  const role = person.role === "emt" ? "emt" : person.role === "lead" ? "lead" : "staff";
  const plan = state?.plans.at(-1);
  const clinical = state?.clinicalRevision;
  const resources = state?.resourceRevision;
  const agentStatus = state?.agent.status;
  const agentRunning = agentStatus === "running" && now - Date.parse(state?.agent.startedAt || "") < 105000;
  const nextAllowed = state?.agent.nextAllowedAt || 0;
  useEffect(() => { if (plan && agentStatus === "idle") setActionError(""); }, [plan?.id, agentStatus]);
  const liveAvailable = !!snapshot?.config.liveAvailable;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (liveAvailable && mode === null) setMode("gemini"); }, [liveAvailable, mode]);
  const run = useCallback(async (command: Command, message?: string) => {
    setBusy(command.action); setActionError("");
    try { await act(command); if (message) toast.success(message); return true; }
    catch (e) { const text = e instanceof Error ? e.message : "Could not save the update."; setActionError(text); toast.error(text); return false; }
    finally { setBusy(""); }
  }, [act]);
  const runAgent = useCallback(async (selected: "gemini" | "rehearsal", force = false) => {
    const current = latest.current; if (!current) return;
    setMode(selected); setBusy("evaluate"); setActionError("");
    attempted.current = [current.encounter.clinicalRevision, current.encounter.resourceRevision, selected].join(":");
    try { await act({ action: "evaluate", actor: latestPersona.current, mode: selected, force }); }
    catch (e) {
      if (e instanceof ApiError && e.retryAfterMs && (e.status === 429 || e.status === 409)) {
        attempted.current = ""; setPauseUntil(Date.now() + e.retryAfterMs);
      } else { const text = e instanceof Error ? e.message : "Could not prepare the report."; setActionError(text); toast.error(text); }
    } finally { setBusy(""); }
  }, [act]);
  useEffect(() => {
    if (!clinical || !mode || role === "staff" || dirty || busy || syncError || agentRunning || (mode === "gemini" && !liveAvailable)) return;
    if (plan && plan.source === mode && plan.clinicalRevision === clinical && plan.resourceRevision === resources) return;
    const key = [clinical, resources, mode].join(":"); if (attempted.current === key) return;
    const delay = Math.max(3000, nextAllowed - Date.now(), pauseUntil - Date.now());
    const timer = setTimeout(() => void runAgent(mode), delay);
    return () => clearTimeout(timer);
    // Dependencies are revisions/primitives so the two-second poll cannot keep
    // restarting the three-second debounce. runAgent reads the latest snapshot.
  }, [clinical, resources, mode, role, dirty, busy, syncError, agentRunning, liveAvailable, plan?.id, plan?.resourceRevision, nextAllowed, pauseUntil, runAgent]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool || !sessionId) return;
    const lifecycle = new AbortController();
    const tools = [
      { name: "read_relay_encounter", title: "Read Relay encounter", description: "Read the fictional patient, reviewed plan and staff readiness. No changes.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => { const s = latest.current?.encounter; return s ? { patientId: s.patientId, clinicalRevision: s.clinicalRevision, etaMinutes: s.etaMinutes, latestNote: s.notes.at(-1), plan: s.plans.at(-1), assignments: s.assignments } : { error: "Encounter is loading." }; } },
      { name: "open_relay_persona", title: "Open a Relay persona", description: "Switch the visible fictional persona. Does not approve, dispatch or change patient data.", inputSchema: { type: "object", properties: { persona: { type: "string", enum: PEOPLE.map(p => p.id) } }, required: ["persona"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => { const id = (input as { persona?: unknown })?.persona; if (typeof id !== "string" || !PEOPLE.some(p => p.id === id)) throw new Error("Unknown persona."); if (dirty) throw new Error("Save the note draft before changing persona."); switchPersona(id); return { persona: id }; } },
    ];
    for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
    return () => lifecycle.abort();
  }, [sessionId, switchPersona, dirty]);
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); toast.success("Persona session link copied."); } catch { toast.error("Copy the current browser address to share this view."); } };
  const pendingSeconds = Math.max(0, Math.ceil((Math.max(nextAllowed, pauseUntil) - now) / 1000));
  const stale = !!plan && (plan.clinicalRevision !== clinical || plan.resourceRevision !== resources || agentStatus === "error");
  const disabled = !!busy || dirty;
  const ready = state?.assignments.filter(t => t.status === "ready").length || 0;
  const active = state?.assignments.filter(t => t.status !== "superseded").length || 0;
  const citedEvidence = new Set(plan?.tasks.flatMap(t => t.evidenceIds) || []);
  return <TooltipProvider><div className="relay-app"><Toaster position="bottom-right" richColors closeButton />
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><Activity size={23} /></span>relay<span className="brand-divider" /><span className="brand-caption">PRE-ARRIVAL COORDINATION</span></a><div className="topbar-right"><span className="simulation">Fictional patient · Demo</span><span className="avatar">{person.initials}</span></div></header>
    <div className="workspace-bar"><Tabs value={role} onValueChange={v => switchPersona(v === "emt" ? "maya" : v === "lead" ? "sofia" : "lena")}><TabsList className="role-tabs"><TabsTrigger value="emt" disabled={disabled}><Truck size={16} /> EMT</TabsTrigger><TabsTrigger value="lead" disabled={disabled}><ShieldCheck size={16} /> ER lead</TabsTrigger><TabsTrigger value="staff" disabled={disabled}><Users size={16} /> Staff</TabsTrigger></TabsList></Tabs><div className="persona-controls"><Select value={person.id} onValueChange={switchPersona} disabled={disabled}><SelectTrigger aria-label="Current persona" className="persona-select"><SelectValue /></SelectTrigger><SelectContent>{PEOPLE.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.label}</SelectItem>)}</SelectContent></Select><Button variant="ghost" size="icon" onClick={() => void share()} aria-label="Copy persona link"><Link2 size={18} /></Button></div></div>
    <main className="workspace">
      {!state ? <section className="panel loading-panel"><Activity size={32} /><h1>{syncError ? "Unable to load this encounter" : "Opening your demo encounter"}</h1><p>{syncError || "Connecting the ambulance and receiving team…"}</p>{syncError ? <Button onClick={() => window.location.reload()}>Retry connection</Button> : <LoaderCircle className="spin" />}</section> : <>
        <div className="page-heading"><div><p className="eyebrow">{role === "emt" ? "AMBULANCE WORKSPACE / MEDIC 12" : role === "lead" ? "RECEIVING TEAM / NORTHLINE MEDICAL" : "STAFF WORKSPACE / NORTHLINE MEDICAL"}</p><h1>{role === "emt" ? "Incoming trauma" : role === "lead" ? "Coordinate the receiving team" : "Your preparation assignments"}</h1><p className="muted">{role === "emt" ? "Update the field report as the patient's condition changes." : role === "lead" ? "Review the handoff. Prepare the team before arrival." : person.name + " · " + person.label}</p></div><div className={"connection " + (syncError ? "text-error" : "")}><Radio size={16} />{syncError ? "Connection interrupted" : "Shared encounter"}<span className="rev-label">REV {state.clinicalRevision}</span></div></div>
        {syncError ? <div className="inline-error" role="alert">{syncError} Showing the last received encounter. Unsaved notes remain in this browser.</div> : null}
        <section className="patient-banner"><div><span className="pill danger">Priority · Urgent clinician review</span><h2>{state.patientId}<span>{state.age === null ? "Age unknown" : state.age + " years (reported)"}</span></h2><p>Medic 12 <ArrowUpRight size={13} /> Northline Medical · ED</p><div className="patient-metadata"><span>Blood type <strong>Unverified</strong></span><span>{plan?.approvedAt ? "Team dispatched" : active ? "Updated plan awaiting review" : "Team on standby"}</span></div></div><div className="eta"><small>ESTIMATED ARRIVAL · EMT REPORTED</small><strong>{String(state.etaMinutes).padStart(2, "0")}<span> min</span></strong><span>{active ? ready + " of " + active + " assignments ready" : "Receiving team awaiting dispatch"}</span></div></section>
        <Observations state={state} persona={person.id} canEdit={role === "emt" && !dirty && !busy} act={act} />
        {role !== "staff" ? <section className={"agent-strip " + (agentStatus === "error" ? "agent-error" : "")}><div className="agent-icon">{agentRunning || busy === "evaluate" ? <LoaderCircle className="spin" size={21} /> : <Sparkles size={21} />}</div><div className="agent-description"><strong>{agentRunning || busy === "evaluate" ? "Preparing the handoff…" : agentStatus === "error" ? "Report needs attention" : !liveAvailable && mode !== "rehearsal" ? "Connect Gemini for live coordination" : stale ? "New information is ready for review" : plan ? "Latest handoff prepared" : "Ready to build the first handoff"}</strong><span>{mode === "rehearsal" ? "Scripted rehearsal is selected. This is a fixed scenario, not live AI." : !liveAvailable ? "The clinical workflow is ready. Use a Gemini key or choose a labeled rehearsal." : dirty ? "The agent will evaluate after your notes are saved." : "Gemini reviews notes after a pause. Preparation tasks require ER lead approval."}</span></div><div className="agent-actions"><Button disabled={disabled || !liveAvailable || agentRunning || pendingSeconds > 0} onClick={() => void runAgent("gemini", true)}><Sparkles />{pendingSeconds > 0 ? "Retry in " + pendingSeconds + "s" : plan ? "Refresh with Gemini" : "Run Gemini"}</Button><Button variant="outline" disabled={disabled || agentRunning || pendingSeconds > 0} onClick={() => void runAgent("rehearsal", true)}><Play /> Scripted rehearsal</Button></div></section> : null}
        {actionError ? <p className="inline-error" role="alert">{actionError}</p> : null}
        {state.agent.error ? <p className="inline-error" role="status">{state.agent.error}</p> : null}
        <div className={"main-grid " + (role === "lead" ? "lead-grid" : "")}>
          <div className="panel-stack">
            {role === "emt" ? <><NotesEditor key={"notes-" + sessionId + person.id} state={state} persona={person.id} act={act} onDirty={setDirty} /><section className="panel scenario-panel"><div className="panel-heading"><h2><Play size={18} /> Scenario controls</h2><span className="pill neutral">Simulation only</span></div><p className="muted">Advance the crash scenario to add worsening observations and a five-minute ETA.</p><Button variant="outline" disabled={disabled || state.scenario === "worsening"} onClick={() => void run({ action: "scenario", actor: person.id, stage: "worsening", expectedRevision: state.clinicalRevision }, "Scenario advanced. The receiving team can see the update.")}>{state.scenario === "worsening" ? <ShieldCheck /> : <ArrowUpRight />}{state.scenario === "worsening" ? "Worsening scenario applied" : "Add worsening update"}</Button></section><TelemetryPanel key={"telemetry-" + sessionId + person.id} sessionId={sessionId} persona={person.id} telemetry={snapshot?.telemetry || null} canConnect /></> : role === "lead" ? <><CoordinationPanel state={state} persona={person.id} isLead act={act} run={run} busy={!!busy} sessionId={sessionId} /><Resources state={state} persona={person.id} run={run} busy={!!busy} /></> : <StaffAssignments state={state} persona={person.id} run={run} busy={!!busy} />}
            {role !== "emt" ? <section className="panel incoming-note"><div className="panel-heading"><h2><ClipboardList size={18} /> Live EMT update</h2><span className="pill neutral">Reported</span></div><p>{state.notes.at(-1)?.text || "No field notes documented."}</p><small>{state.people.find(p => p.id === state.notes.at(-1)?.author)?.name} · {new Date(state.notes.at(-1)!.at).toLocaleTimeString()}</small></section> : null}
          </div>
          <div className="panel-stack"><HandoffPanel state={state} />{role === "emt" ? <CoordinationPanel state={state} persona={person.id} isLead={false} act={act} run={run} busy={!!busy} sessionId={sessionId} /> : null}
            <section className="panel timeline-panel"><div className="panel-heading"><h2><Clock3 size={18} /> Coordination timeline</h2><span className="muted">{state.events.length} events</span></div><ol className="timeline">{state.events.slice(showAllEvents ? -30 : -7).reverse().map(e => <li key={e.id}><span className={"timeline-marker " + (e.kind === "dispatch" ? "marker-success" : e.kind === "error" ? "marker-error" : "")} /><div><p>{e.text}</p><small>{state.people.find(p => p.id === e.actor)?.name || "Relay"} · {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></div></li>)}</ol>{state.events.length > 7 ? <Button variant="ghost" size="sm" onClick={() => setShowAllEvents(v => !v)}>{showAllEvents ? "Show recent events" : "Show more events"}</Button> : null}</section>
          </div>
        </div>
        <section className="panel evidence-panel"><div className="panel-heading"><h2>Source observations</h2><span className="muted">Evidence referenced by the handoff</span></div><div className="evidence-records">{state.notes.filter((n, i) => i >= state.notes.length - 4 || citedEvidence.has(n.id)).map(n => <article id={"evidence-" + n.id} key={n.id}><span className="pill neutral">{n.id} · EMT report</span><p>{n.text || "No note text supplied."}</p></article>)}{state.observations.filter((o, i) => i >= state.observations.length - 6 || citedEvidence.has(o.id)).map(o => <article id={"evidence-" + o.id} key={o.id}><span className="pill neutral">{o.id} · Simulated</span><p>{Object.entries(o.values).map(([k, v]) => k.toUpperCase() + ": " + (v ?? "unknown")).join(" · ")}</p></article>)}</div></section>
        <footer className="workspace-footer"><div><span>Relay · Fictional training scenario</span><Glossary /></div><div><span>Confirm the handoff on arrival.</span>{role !== "staff" ? <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={disabled}><RotateCcw size={14} /> Reset demo</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset this demo session?</AlertDialogTitle><AlertDialogDescription>This clears its notes, plans, reservations and task history in every linked view, then restores the initial fictional crash scenario.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep encounter</AlertDialogCancel><AlertDialogAction onClick={() => { attempted.current = ""; void run({ action: "reset", actor: person.id, expectedRevision: state.clinicalRevision }, "Demo reset."); }}>Reset demo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></footer>
      </>}
    </main></div></TooltipProvider>;
}
