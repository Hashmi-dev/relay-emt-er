"use client";
import { useState } from "react";
import { Pencil, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFINITIONS } from "@/lib/relay/catalog";
import type { Command, EncounterState, Snapshot, Vitals } from "@/lib/relay/types";
import { LiveMonitor } from "./live-monitor";

const metrics: { key:keyof Vitals; label:string; unit:string }[] = [{key:"hr",label:"HR",unit:"bpm"},{key:"sbp",label:"BP",unit:"mmHg"},{key:"rr",label:"RR",unit:"/min"},{key:"spo2",label:"SpO₂",unit:"%"},{key:"temp",label:"Temp",unit:"°C"},{key:"gcs",label:"GCS",unit:"/15"}];
export function Definition({label}:{label:string}) {return <Tooltip><TooltipTrigger asChild><button className="definition" aria-label={DEFINITIONS[label]}>{label}<HelpCircle size={12}/></button></TooltipTrigger><TooltipContent>{DEFINITIONS[label]}</TooltipContent></Tooltip>;}
export function Glossary() {return <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm"><HelpCircle/> Abbreviations</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Clinical shorthand</DialogTitle><DialogDescription>Terms used in this fictional coordination workspace.</DialogDescription></DialogHeader><dl className="glossary">{Object.entries(DEFINITIONS).map(([key,text])=><div key={key}><dt>{key}</dt><dd>{text}</dd></div>)}<div><dt>ATMIST</dt><dd>Age, Time, Mechanism, Injuries, Signs, Treatment</dd></div><div><dt>SBAR</dt><dd>Situation, Background, Assessment, Recommendation</dd></div></dl></DialogContent></Dialog>;}
function Trend({values}:{values:(number|null)[]}) {
  const valid=values.filter((v):v is number=>v!==null);if(valid.length<2)return <span className="trend-placeholder">First observation</span>;
  const low=Math.min(...valid),range=Math.max(...valid)-low||1;
  const points=values.map((v,i)=>v===null?null:[5+i*90/Math.max(1,values.length-1),27-(v-low)/range*21]);
  return <svg viewBox="0 0 100 32" className="sparkline" role="img" aria-label={"Observation trend: "+values.map(v=>v??"unknown").join(", ")}>{points.map((p,i)=>p&&<g key={i}>{i>0&&points[i-1]?<line x1={points[i-1]![0]} y1={points[i-1]![1]} x2={p[0]} y2={p[1]}/>:null}<circle cx={p[0]} cy={p[1]} r="2"/></g>)}</svg>;
}
export function Observations({state,persona,canEdit,act}:{state:EncounterState;persona:string;canEdit:boolean;act:(c:Command)=>Promise<Snapshot>}) {
  const last=state.observations.at(-1)!;
  const display=(key:keyof Vitals)=>last.values[key]===null?"—":key==="temp"?last.values[key].toFixed(1):Math.round(last.values[key]);
  const [open,setOpen]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const [values,setValues]=useState<Record<string,string>>({});const [revision,setRevision]=useState(0);
  const edit=()=>{setValues(Object.fromEntries(Object.entries(last.values).map(([k,v])=>[k,v===null?"":String(v)])));setRevision(state.clinicalRevision);setError("");setOpen(true);};
  const save=async()=>{setSaving(true);setError("");try {const parsed=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.trim()===""?null:Number(v)])) as unknown as Vitals;await act({action:"observations",actor:persona,values:parsed,expectedRevision:revision});setOpen(false);}catch(e){setError(e instanceof Error?e.message:"Could not save observations.");}finally{setSaving(false);}};
  return <><div className="section-line"><h2>Patient observations <span className="observation-time">{new Date(last.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></h2><div className="inline-actions"><span className="pill neutral">Simulated vitals</span>{canEdit?<Button variant="ghost" size="sm" onClick={edit}><Pencil size={14}/> Update</Button>:null}</div></div>
  <section className="vitals-grid">{metrics.map(m=><article className="vital" key={m.key}><Definition label={m.label}/><strong>{m.key==="sbp"?display("sbp")+"/"+display("dbp"):display(m.key)}<small>{m.unit}</small></strong><Trend values={state.observations.slice(-8).map(o=>o.values[m.key])}/></article>)}</section>
  <LiveMonitor values={last.values}/>
  <Dialog open={open} onOpenChange={v=>!saving&&setOpen(v)}><DialogContent><DialogHeader><DialogTitle>Record simulated observations</DialogTitle><DialogDescription>Blank values are recorded as unknown. All patient readings in this demo are simulated.</DialogDescription></DialogHeader><form onSubmit={e=>{e.preventDefault();void save();}}><div className="input-grid">{Object.keys(last.values).map(key=><label key={key} className="field-label">{key==="sbp"?"Systolic BP":key==="dbp"?"Diastolic BP":metrics.find(m=>m.key===key)?.label}<Input type="number" step={key==="temp"?"0.1":"1"} value={values[key]||""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>)}</div>{error?<p className="inline-error" role="alert">{error}</p>:null}<Button disabled={saving} type="submit">{saving?"Saving…":"Save observations"}</Button></form></DialogContent></Dialog></>;
}
