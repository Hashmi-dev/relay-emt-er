import test from "node:test";
import assert from "node:assert/strict";
import { createEncounter, TASKS } from "../lib/relay/catalog";
import { addDraft, applyCommand, approvePlan, proposalOf } from "../lib/relay/workflow";
import { validateProposal, frameSchema, commands } from "../lib/relay/validation";
import { SerialFrameDecoder } from "../lib/relay/serial";
import type { EncounterState, Proposal } from "../lib/relay/types";

function proposal(state: EncounterState): Proposal {
  return { summary: "Reported crash, bleeding and suspected leg fracture. Clinician review required.", concerns: ["Reported bleeding requires assessment."], unknowns: ["Blood type unverified."], conflicts: [],
    handoff: { age: "34 years", time: state.incidentAt, mechanism: "Reported motor vehicle collision", injuries: "Suspected leg fracture", signs: "Simulated observations", treatment: "Unknown" },
    tasks: [{ category: "trauma_bay", personId: "lena", roomId: "T2", rationale: "Receiving bay required for the reported crash.", evidenceIds: [state.notes.at(-1)!.id] },
      { category: "orthopedic_consult", personId: "nina", roomId: "T2", rationale: "Suspected leg fracture reported.", evidenceIds: [state.notes.at(-1)!.id] }],
  };
}
function drafted() { const s = createEncounter(crypto.randomUUID()); addDraft(s, proposal(s), "rehearsal", "fixture"); return s; }

test("intake fields may be empty and reported blood type remains unverified", () => {
  const s = createEncounter(crypto.randomUUID());
  const blank = commands.notes.parse({ actor: "maya", text: "", age: null, etaMinutes: null, bloodTypeReported: null, expectedRevision: 1 });
  applyCommand(s, { action: "notes", ...blank });
  assert.equal(s.age, null); assert.equal(s.etaMinutes, null); assert.equal(s.bloodTypeReported, null); assert.equal(s.notes.at(-1)!.text, "");
  applyCommand(s, { action: "notes", ...blank, bloodTypeReported: "O+", expectedRevision: s.clinicalRevision });
  assert.equal(s.bloodTypeReported, "O+");
  const plan = proposal(s);
  plan.tasks.push({ category: "blood_bank", personId: "sam", roomId: null, rationale: "Reported bleeding requires blood-bank preparation.", evidenceIds: [s.notes.at(-1)!.id] });
  addDraft(s, plan, "rehearsal", "fixture"); approvePlan(s, s.plans.at(-1)!.id, "sofia");
  assert.match(s.assignments.find(a => a.category === "blood_bank")!.instruction, /Blood type is unverified/);
  assert.equal(commands.notes.safeParse({ ...blank, bloodTypeReported: "Z+" }).success, false);
});

test("demo temperature changes only temperature and rejects stale or unauthorized scans", () => {
  const s = drafted(); const before = structuredClone(s.observations.at(-1)!.values);
  const reading = commands.temperature.parse({ actor: "maya", value: 34.8, expectedRevision: s.clinicalRevision });
  applyCommand(s, { action: "temperature", ...reading });
  assert.deepEqual(s.observations.at(-1)!.values, { ...before, temp: 34.8 });
  assert.equal(s.observations.at(-1)!.source, "simulated"); assert.equal(s.observations.length, 2);
  assert.equal(s.assignments.length, 0); assert.throws(() => approvePlan(s, s.plans[0].id, "sofia"), /outdated/);
  assert.throws(() => applyCommand(s, { action: "temperature", ...reading }), /New EMT information/);
  assert.throws(() => applyCommand(s, { action: "temperature", ...reading, actor: "lena", expectedRevision: s.clinicalRevision }), /different demo persona/);
  for (const value of [34.4, 36, NaN]) assert.equal(commands.temperature.safeParse({ ...reading, value }).success, false);
});

test("drafts cannot dispatch; only the lead may approve", () => {
  const s = drafted(); assert.equal(s.assignments.length, 0); assert.equal(s.rooms.find(r=>r.id==="T2")!.status,"available");
  assert.throws(()=>approvePlan(s,s.plans[0].id,"maya"), /different demo persona/);
  approvePlan(s,s.plans[0].id,"sofia"); assert.equal(s.assignments.length,2); assert.equal(s.rooms.find(r=>r.id==="T2")!.status,"reserved");
  assert.equal(s.assignments[0].instruction,TASKS.trauma_bay.instruction);
});
test("duplicate approval does not duplicate tasks, events or reservations",()=>{
  const s=drafted();approvePlan(s,s.plans[0].id,"sofia");const before=JSON.stringify(s);approvePlan(s,s.plans[0].id,"sofia");assert.equal(JSON.stringify(s),before);
});
test("new clinical information and changed resources block stale approval",()=>{
  const s=drafted();applyCommand(s,{action:"notes",actor:"maya",text:"Updated observations pending.",age:34,etaMinutes:5,expectedRevision:1});assert.throws(()=>approvePlan(s,s.plans[0].id,"sofia"),/outdated/);assert.equal(s.assignments.length,0);
  const r=drafted();applyCommand(r,{action:"resource",actor:"sofia",kind:"room",id:"T2",available:false});assert.throws(()=>approvePlan(r,r.plans[0].id,"sofia"),/outdated/);
});
test("unknown evidence, wrong specialties and occupied rooms are rejected",()=>{
  const s=createEncounter("test");const p=proposal(s);p.tasks[0].evidenceIds=["invented"];assert.throws(()=>validateProposal(p,s),/unknown evidence/);
  p.tasks[0].evidenceIds=["note-1"];p.tasks[0].personId="sam";assert.throws(()=>validateProposal(p,s),/incompatible staff/);
  p.tasks[0].personId="lena";p.tasks[0].roomId="T1";assert.throws(()=>validateProposal(p,s),/occupied/);
  p.tasks[0].roomId="T2";s.people.find(p=>p.id==="nina")!.available=false;assert.throws(()=>validateProposal(p,s),/unavailable/);
});
test("review edits create a new ID and invalidate the old review",()=>{
  const s=drafted(),old=s.plans[0].id;const p=proposalOf(s.plans[0]);p.summary="Edited summary.";applyCommand(s,{action:"edit-plan",actor:"sofia",planId:old,proposal:p});assert.notEqual(s.plans.at(-1)!.id,old);assert.throws(()=>approvePlan(s,old,"sofia"),/outdated/);
});
test("staff readiness survives approved report revisions and removed tasks are superseded",()=>{
  const s=drafted();approvePlan(s,s.plans[0].id,"sofia");const task=s.assignments[0];applyCommand(s,{action:"task",actor:"lena",taskId:task.id,status:"ready",note:""});
  applyCommand(s,{action:"scenario",actor:"maya",stage:"worsening",expectedRevision:s.clinicalRevision});const p=proposal(s);p.tasks=p.tasks.slice(0,1);addDraft(s,p,"rehearsal","fixture");approvePlan(s,s.plans.at(-1)!.id,"sofia");
  assert.equal(s.assignments[0].id,task.id);assert.equal(s.assignments[0].status,"ready");assert.equal(s.assignments[0].history.length,2);assert.equal(s.assignments[1].status,"superseded");
});
test("blocked tasks require explanation and another persona cannot acknowledge them",()=>{
  const s=drafted();approvePlan(s,s.plans[0].id,"sofia");const task=s.assignments[0];assert.throws(()=>applyCommand(s,{action:"task",actor:"lena",taskId:task.id,status:"blocked",note:""}),/Describe/);
  assert.throws(()=>applyCommand(s,{action:"task",actor:"owen",taskId:task.id,status:"ready",note:""}),/another staff/);
});
test("reset revisions remain monotonic and invalidate previous tab edits",()=>{
  const s=drafted();const rev=s.clinicalRevision;applyCommand(s,{action:"reset",actor:"maya",expectedRevision:rev});assert.ok(s.clinicalRevision>rev);assert.throws(()=>applyCommand(s,{action:"notes",actor:"maya",text:"old tab",age:34,etaMinutes:7,expectedRevision:rev}),/New EMT information/);
});
test("serial decoder reassembles chunks and rejects malformed or nonfinite frames",()=>{
  const decoder=new SerialFrameDecoder(),encoder=new TextEncoder();const frame={seq:1,uptimeMs:200,ax:0.1,ay:0.2,az:1,gx:0,gy:0,gz:0};const json=JSON.stringify(frame)+"\n";
  assert.deepEqual(decoder.push(encoder.encode(json.slice(0,35))),[]);assert.deepEqual(decoder.push(encoder.encode(json.slice(35))),[frame]);
  assert.deepEqual(decoder.push(encoder.encode("bad\n{\"hr\":132}\n")),[]);assert.equal(decoder.invalid,2);assert.equal(frameSchema.safeParse({...frame,ax:Infinity}).success,false);
});
