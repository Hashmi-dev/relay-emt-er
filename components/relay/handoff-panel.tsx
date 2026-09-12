"use client";
import { ClipboardCheck, Radio } from "lucide-react";
import type { EncounterState } from "@/lib/relay/types";
export function HandoffPanel({state}:{state:EncounterState}) {
  const plan=state.plans.at(-1),previous=state.plans.at(-2);
  const stale=plan&&(plan.clinicalRevision!==state.clinicalRevision||plan.resourceRevision!==state.resourceRevision||state.agent.status==="error");
  const fields=[['age','A','Age'],['time','T','Time'],['mechanism','M','Mechanism'],['injuries','I','Injuries'],['signs','S','Signs'],['treatment','T','Treatment']] as const;
  return <section className="panel"><div className="panel-heading"><h2><ClipboardCheck size={18}/> ATMIST handoff</h2><span className={"pill "+(stale?"amber":plan?.approvedAt?"success":"neutral")}>{stale?"Update needed":plan?.approvedAt?"Reviewed":plan?"Draft":"Awaiting report"}</span></div>
  {plan?<><p className="handoff-summary">{plan.summary}</p><div className="report-meta"><span className={"pill "+(plan.source==="rehearsal"?"amber":"success")}>{plan.source==="rehearsal"?"Scripted rehearsal":"Gemini"}</span><span>Based on clinical revision {plan.clinicalRevision}</span></div><dl className="atmist">{fields.map(([key,letter,label])=><div key={key}><dt><span>{letter}</span>{label}</dt><dd>{plan.handoff[key]}</dd></div>)}</dl>
  {plan.concerns.length>0?<div className="concerns"><h3>Clinical concerns · for review</h3>{plan.concerns.map((c,i)=><p key={i}>{c}</p>)}</div>:null}
  {plan.conflicts.length>0?<div className="inline-error"><h3>Information to reconcile</h3>{plan.conflicts.map((c,i)=><p key={i}>{c}</p>)}</div>:null}
  <div className="unknowns"><h3>Still to confirm</h3><ul>{plan.unknowns.map((c,i)=><li key={i}>{c}</li>)}</ul></div>
  {previous?<div className="report-changes"><h3>Changed since the previous report</h3>{fields.filter(([key])=>previous.handoff[key]!==plan.handoff[key]).length?fields.filter(([key])=>previous.handoff[key]!==plan.handoff[key]).map(([key,,label])=><p key={key}><strong>{label}:</strong> {plan.handoff[key]}</p>):<p>Handoff fields unchanged; review preparation assignments for resource changes.</p>}</div>:null}
  </>:<div className="empty-state"><span className="empty-icon"><Radio size={28}/></span><h3>Ready for the first handoff</h3><p>Run the agent to turn the latest field notes into a structured report and preparation proposal.</p></div>}
  <div className="info-strip">Confirm patient identity and a brief handoff on arrival.</div></section>;
}
