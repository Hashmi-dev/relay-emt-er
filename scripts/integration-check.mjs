import assert from 'node:assert/strict';
const origin = process.env.RELAY_URL || 'http://localhost:5173';
async function request(path, body, expected=200) {
  const response = await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  assert.equal(response.status,expected,JSON.stringify(data)); return data;
}
const {id}=await request('/api/sessions',{},201);
const path='/api/sessions/'+id;
let state=(await request(path)).encounter;
assert.equal(state.assignments.length,0);
state=(await request(path+'/evaluate',{actor:'maya',mode:'rehearsal'})).encounter;
const plan=state.plans.at(-1);
assert.equal(plan.tasks.length,7);assert.equal(state.assignments.length,0);
await request(path+'/approve',{actor:'maya',planId:plan.id},403);
const approvals=await Promise.all([request(path+'/approve',{actor:'sofia',planId:plan.id}),request(path+'/approve',{actor:'sofia',planId:plan.id})]);
state=(await request(path)).encounter;
assert.equal(state.assignments.length,7);assert.equal(state.events.filter(e=>e.kind==='dispatch').length,1);
const assignment=state.assignments.find(t=>t.personId==='lena');
state=(await request(path+'/task',{actor:'lena',taskId:assignment.id,status:'ready',note:''})).encounter;
assert.equal(state.assignments.find(t=>t.id===assignment.id).status,'ready');
const before=structuredClone(state);
await request(path+'/telemetry',{actor:'maya',frame:{seq:1,uptimeMs:200,ax:0.2,ay:0.3,az:1,gx:0,gy:0,gz:0}});
const motion=await request(path);
assert.deepEqual(motion.encounter.observations,before.observations);assert.equal(motion.encounter.clinicalRevision,before.clinicalRevision);assert.equal(motion.telemetry.ax,0.2);
await request(path+'/notes',{actor:'maya',text:'Changed field notes for API concurrency test.',age:34,etaMinutes:5,expectedRevision:state.clinicalRevision});
await request(path+'/notes',{actor:'ben',text:'Stale update.',age:34,etaMinutes:8,expectedRevision:state.clinicalRevision},409);
const fresh=await request(path);
assert.equal(fresh.encounter.assignments.find(t=>t.id===assignment.id).status,'ready');
assert.equal(fresh.encounter.etaMinutes,5);
const intake=(await request(path+'/notes',{actor:'maya',text:'',age:null,etaMinutes:null,bloodTypeReported:'AB-',expectedRevision:fresh.encounter.clinicalRevision})).encounter;
assert.equal(intake.age,null);assert.equal(intake.etaMinutes,null);assert.equal(intake.bloodTypeReported,'AB-');assert.equal(intake.notes.at(-1).text,'');
let scanned=intake;
if(process.env.RELAY_SCAN_LOCKED==='1') {
  const denied=await request(path+'/scan-access',{actor:'maya'},403);
  assert.equal(denied.error,'Arduino not found 🙂');
  const direct=await request(path+'/temperature',{actor:'maya',value:34.7,expectedRevision:intake.clinicalRevision},403);
  assert.equal(direct.error,'Arduino not found 🙂');
  assert.deepEqual((await request(path)).encounter.observations,intake.observations);
} else {
  await request(path+'/scan-access',{actor:'lena'},403);
  const access=await request(path+'/scan-access',{actor:'maya'});
  assert.equal(access.encounter.clinicalRevision,intake.clinicalRevision);
  scanned=(await request(path+'/temperature',{actor:'maya',value:34.7,expectedRevision:intake.clinicalRevision})).encounter;
  assert.deepEqual(scanned.observations.at(-1).values,{...intake.observations.at(-1).values,temp:34.7});
  assert.equal(scanned.observations.length,intake.observations.length+1);
  await request(path+'/temperature',{actor:'maya',value:35.1,expectedRevision:intake.clinicalRevision},409);
  await request(path+'/temperature',{actor:'maya',value:37.1,expectedRevision:scanned.clinicalRevision},400);
  assert.equal((await request(path)).encounter.observations.at(-1).values.temp,34.7);
}
await request(path+'/reset',{actor:'maya',expectedRevision:scanned.clinicalRevision});
const reset=await request(path);assert.equal(reset.encounter.assignments.length,0);assert.equal(reset.telemetry,null);
console.log('PASS: D1 persistence, approval role checks, concurrent idempotent dispatch, staff readiness, telemetry isolation, nullable intake fields, private scan gate ('+(process.env.RELAY_SCAN_LOCKED==='1'?'locked':'enabled')+'), stale edits and reset.');
console.log('Test session: '+id);
