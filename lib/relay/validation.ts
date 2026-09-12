import { z } from "zod";
import { TASKS } from "./catalog";
import type { EncounterState, Proposal } from "./types";
export class RelayError extends Error {
  constructor(message: string, public status = 400, public retryAfterMs?: number) { super(message); }
}
const finite = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
export const vitalsSchema = z.object({ hr: finite(0, 300), sbp: finite(0, 300), dbp: finite(0, 200), rr: finite(0, 100), spo2: finite(0, 100), temp: finite(20, 45), gcs: z.number().int().min(3).max(15).nullable() }).strict();
export const frameSchema = z.object({ seq: z.number().int().min(0).max(4294967295), uptimeMs: z.number().int().min(0).max(4294967295), ax: z.number().finite().min(-100).max(100), ay: z.number().finite().min(-100).max(100), az: z.number().finite().min(-100).max(100), gx: z.number().finite().min(-5000).max(5000), gy: z.number().finite().min(-5000).max(5000), gz: z.number().finite().min(-5000).max(5000) }).strict();
const prose = z.string().min(1).max(1200);
export const proposalSchema = z.object({
  summary: prose, concerns: z.array(prose).max(8), unknowns: z.array(prose).max(12), conflicts: z.array(prose).max(8),
  handoff: z.object({ age: prose, time: prose, mechanism: prose, injuries: prose, signs: prose, treatment: prose }).strict(),
  tasks: z.array(z.object({ category: z.enum(["trauma_bay", "trauma_nursing", "blood_bank", "trauma_assessment", "orthopedic_consult", "imaging_readiness", "or_standby"]), personId: z.string().max(50), roomId: z.string().max(50).nullable(), rationale: prose, evidenceIds: z.array(z.string().max(80)).min(1).max(8) }).strict()).max(12),
}).strict();
export function validateProposal(input: unknown, state: EncounterState): Proposal {
  const plan = proposalSchema.parse(input);
  const evidence = new Set([...state.notes.map(n => n.id), ...state.observations.map(o => o.id)]);
  const seen = new Set<string>();
  for (const task of plan.tasks) {
    if (seen.has(task.category)) throw new RelayError("Each preparation category may be assigned only once.");
    seen.add(task.category);
    const rule = TASKS[task.category];
    const person = state.people.find(p => p.id === task.personId);
    if (!person || person.role !== rule.role) throw new RelayError("A proposed task has an incompatible staff role.");
    if (!person.available) throw new RelayError(person.name + " is unavailable. Revise the proposed team.", 409);
    if (task.evidenceIds.some(id => !evidence.has(id))) throw new RelayError("The proposal references unknown evidence.");
    if (rule.room) {
      const room = state.rooms.find(r => r.id === task.roomId);
      if (!room || room.kind !== rule.room) throw new RelayError("A proposed task has an incompatible location.");
      if (room.status === "occupied") throw new RelayError(room.label + " is occupied. Revise the proposed location.", 409);
    } else if (task.roomId !== null) throw new RelayError("Blood-bank coordination does not reserve a patient room.");
  }
  return plan;
}
const actor = z.string().min(1).max(40);
const revision = z.number().int().positive();
export const commands = {
  notes: z.object({ actor, text: z.string().max(12000), age: z.number().int().min(0).max(120).nullable(), etaMinutes: z.number().int().min(0).max(240), expectedRevision: revision }).strict(),
  observations: z.object({ actor, values: vitalsSchema, expectedRevision: revision }).strict(),
  scenario: z.object({ actor, stage: z.literal("worsening"), expectedRevision: revision }).strict(),
  evaluate: z.object({ actor, mode: z.enum(["gemini", "rehearsal"]), force: z.boolean().optional() }).strict(),
  "edit-plan": z.object({ actor, planId: z.string(), proposal: proposalSchema }).strict(),
  approve: z.object({ actor, planId: z.string() }).strict(),
  task: z.object({ actor, taskId: z.string(), status: z.enum(["acknowledged", "ready", "blocked"]), note: z.string().max(500) }).strict(),
  resource: z.object({ actor, kind: z.enum(["person", "room"]), id: z.string(), available: z.boolean() }).strict(),
  reset: z.object({ actor, expectedRevision: revision }).strict(),
  telemetry: z.object({ actor, frame: frameSchema }).strict(),
};
