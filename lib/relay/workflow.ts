import { createEncounter, TASKS, WORSENING_VITALS } from "./catalog";
import { RelayError, validateProposal } from "./validation";
import type { Assignment, Command, EncounterState, Person, Plan, Proposal, TaskStatus } from "./types";

export function event(state: EncounterState, actor: string, kind: string, text: string) {
  state.events.push({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, kind, text });
}
export function requireActor(state: EncounterState, actor: string, allowed?: Person["role"][]) {
  const person = state.people.find(p => p.id === actor);
  if (!person || (allowed && !allowed.includes(person.role))) throw new RelayError("This action belongs to a different demo persona.", 403);
  return person;
}
function requireRevision(state: EncounterState, revision: number) {
  if (state.clinicalRevision !== revision) throw new RelayError("New EMT information has arrived. Review the latest encounter before saving this change.", 409);
}
function invalidateAgent(state: EncounterState) {
  // An in-flight run may finish, but its snapshot checks prevent stale output
  // from becoming the current draft. Existing approved work remains intact.
  state.clinicalRevision++;
}
export function currentPlan(state: EncounterState): Plan | undefined { return state.plans[state.plans.length - 1]; }
export function proposalOf(plan: Proposal): Proposal { return { summary: plan.summary, concerns: plan.concerns, unknowns: plan.unknowns, conflicts: plan.conflicts, handoff: plan.handoff, tasks: plan.tasks }; }
export function addDraft(state: EncounterState, proposal: Proposal, source: Plan["source"], model: string, actor = "agent") {
  validateProposal(proposal, state);
  state.plans.push({ ...proposal, id: crypto.randomUUID(), clinicalRevision: state.clinicalRevision, resourceRevision: state.resourceRevision, createdAt: new Date().toISOString(), source, model });
  // Preserve the full bounded demo history; require a reset for a long session.
  if (state.plans.length > 80) throw new RelayError("This demo has reached 80 plan revisions. Start a fresh session.", 409);
  state.agent.lastEvaluatedRevision = state.clinicalRevision;
  state.agent.status = "idle"; state.agent.runId = null; state.agent.error = null;
  event(state, actor, "draft", (source === "gemini" ? "Gemini" : "Scripted rehearsal") + " prepared a new handoff and coordination plan. Awaiting ER lead approval.");
}
export function approvePlan(state: EncounterState, planId: string, actor: string) {
  requireActor(state, actor, ["lead"]);
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) throw new RelayError("The review plan was not found.", 404);
  if (plan.approvedAt) return; // Idempotent, including after new input arrives.
  if (currentPlan(state)?.id !== planId || plan.clinicalRevision !== state.clinicalRevision || plan.resourceRevision !== state.resourceRevision)
    throw new RelayError("The plan is outdated. Refresh the draft and review the latest information before dispatch.", 409);
  validateProposal(proposalOf(plan), state);
  const now = new Date().toISOString();
  const active = state.assignments.filter(a => a.status !== "superseded");
  for (const previous of active) {
    const next = plan.tasks.find(t => t.category === previous.category);
    if (!next || previous.personId !== next.personId || previous.roomId !== next.roomId) {
      previous.status = "superseded"; previous.updatedAt = now;
      previous.history.push({ status: "superseded", at: now, actor, note: "Replaced by an approved plan revision." });
    }
  }
  for (const task of plan.tasks) {
    const same = active.find(a => a.category === task.category && a.personId === task.personId && a.roomId === task.roomId);
    const brief = { situation: plan.summary, background: plan.handoff.mechanism + " " + plan.handoff.injuries, assessment: plan.concerns.join(" "), recommendation: TASKS[task.category].instruction };
    if (same) {
      Object.assign(same, task, { planId, updatedAt: now, brief });
      // Acknowledgment and readiness histories survive report updates.
    } else {
      const assignment: Assignment = { ...task, id: crypto.randomUUID(), planId, instruction: TASKS[task.category].instruction, status: "sent", updatedAt: now, statusNote: "", brief,
        history: [{ status: "sent", at: now, actor, note: "ER lead approved dispatch." }] };
      state.assignments.push(assignment);
    }
  }
  const roomIds = new Set(plan.tasks.map(t => t.roomId).filter(Boolean));
  for (const room of state.rooms) {
    if (roomIds.has(room.id)) { room.status = "reserved"; room.reservation = planId; }
    else if (room.status === "reserved") { room.status = "available"; delete room.reservation; }
  }
  state.resourceRevision++;
  plan.resourceRevision = state.resourceRevision;
  plan.approvedAt = now; plan.approvedBy = actor;
  event(state, actor, "dispatch", "Approved and dispatched " + plan.tasks.length + " preparation assignments. Locations reserved for this demo encounter.");
}
export function applyCommand(state: EncounterState, command: Exclude<Command, { action: "evaluate" | "telemetry" }>) {
  const actor = command.actor;
  requireActor(state, actor);
  switch (command.action) {
    case "notes": {
      requireActor(state, actor, ["emt"]); requireRevision(state, command.expectedRevision);
      if (state.notes.at(-1)?.text === command.text && state.age === command.age && state.etaMinutes === command.etaMinutes) return;
      invalidateAgent(state); state.age = command.age; state.etaMinutes = command.etaMinutes;
      state.notes.push({ id: "note-" + state.clinicalRevision, text: command.text, at: new Date().toISOString(), author: actor });
      if (state.notes.length > 150) throw new RelayError("This rehearsal has reached its note limit. Start a fresh session.", 409);
      event(state, actor, "note", "Updated field notes / ETA. Clinical revision " + state.clinicalRevision + "."); break;
    }
    case "observations": {
      requireActor(state, actor, ["emt"]); requireRevision(state, command.expectedRevision); invalidateAgent(state);
      state.observations.push({ id: "obs-" + state.clinicalRevision, values: command.values, at: new Date().toISOString(), source: "simulated", author: actor });
      if (state.observations.length > 150) throw new RelayError("This rehearsal has reached its observation limit. Start a fresh session.", 409);
      event(state, actor, "observation", "Recorded a new set of simulated patient observations."); break;
    }
    case "scenario": {
      requireActor(state, actor, ["emt"]);
      if (state.scenario === "worsening") return;
      requireRevision(state, command.expectedRevision); invalidateAgent(state);
      state.scenario = "worsening"; state.etaMinutes = 5;
      state.notes.push({ id: "note-" + state.clinicalRevision, text: (state.notes.at(-1)?.text || "") + "\nUpdate: increasing confusion and persistent reported bleeding. Suspected leg fracture remains unconfirmed. ETA now five minutes. Treatment updates still needed.", at: new Date().toISOString(), author: actor });
      state.observations.push({ id: "obs-" + state.clinicalRevision, at: new Date().toISOString(), source: "simulated", values: { ...WORSENING_VITALS }, author: actor });
      event(state, actor, "scenario", "Scenario advanced: worsening observations; ETA five minutes."); break;
    }
    case "edit-plan": {
      requireActor(state, actor, ["lead"]);
      const plan = currentPlan(state);
      if (!plan || plan.id !== command.planId || plan.approvedAt || plan.clinicalRevision !== state.clinicalRevision || plan.resourceRevision !== state.resourceRevision)
        throw new RelayError("This draft changed. Refresh it before editing.", 409);
      // A new ID prevents a second lead tab approving a plan it never reviewed.
      const edited = validateProposal(command.proposal, state);
      addDraft(state, edited, plan.source, plan.model, actor);
      currentPlan(state)!.editedBy = actor; break;
    }
    case "approve": approvePlan(state, command.planId, actor); break;
    case "task": {
      const task = state.assignments.find(t => t.id === command.taskId);
      if (!task || task.personId !== actor) throw new RelayError("This assignment belongs to another staff persona.", 403);
      if (task.status === "superseded") throw new RelayError("This assignment has been replaced by a newer plan.", 409);
      if (command.status === "blocked" && !command.note.trim()) throw new RelayError("Describe the blocker so the ER lead can respond.");
      if (task.status === command.status && task.statusNote === command.note) return;
      const now = new Date().toISOString();
      task.status = command.status as TaskStatus; task.updatedAt = now; task.statusNote = command.note;
      task.history.push({ status: task.status, at: now, actor, note: command.note });
      event(state, actor, "task", TASKS[task.category].title + ": " + command.status + (command.note ? " — " + command.note : "")); break;
    }
    case "resource": {
      requireActor(state, actor, ["lead"]);
      if (command.kind === "person") {
        const person = state.people.find(p => p.id === command.id);
        if (!person || ["emt", "lead"].includes(person.role)) throw new RelayError("This staff availability cannot be changed.");
        person.available = command.available;
        event(state, actor, "resource", person.name + (command.available ? " is available." : " is unavailable."));
      } else {
        const room = state.rooms.find(r => r.id === command.id);
        if (!room) throw new RelayError("Unknown room.");
        if (room.status === "reserved") throw new RelayError("This location is reserved. Revise the approved plan before changing its availability.", 409);
        room.status = command.available ? "available" : "occupied";
        event(state, actor, "resource", room.label + " is now " + room.status + ".");
      }
      state.resourceRevision++; break;
    }
    case "reset": {
      requireActor(state, actor, ["lead", "emt"]); requireRevision(state, command.expectedRevision);
      const revision = state.clinicalRevision + 1; const resourceRevision = state.resourceRevision + 1;
      Object.assign(state, createEncounter(state.id));
      // Monotonic revisions invalidate edits and requests from tabs opened before reset.
      state.clinicalRevision = revision; state.resourceRevision = resourceRevision;
      event(state, actor, "reset", "Reset this fictional demo encounter."); break;
    }
  }
}
