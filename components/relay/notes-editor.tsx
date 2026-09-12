"use client";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Command, EncounterState, Snapshot } from "@/lib/relay/types";

export function NotesEditor({state,persona,act,onDirty}:{state:EncounterState;persona:string;act:(c:Command)=>Promise<Snapshot>;onDirty:(dirty:boolean)=>void}) {
  const initial={text:state.notes.at(-1)?.text||"",age:state.age===null?"":String(state.age),eta:String(state.etaMinutes)};
  const [draft,setDraft]=useState(initial),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const base=useRef(state.clinicalRevision),latest=useRef(draft);latest.current=draft;
  useEffect(()=>{onDirty(dirty||saving);},[dirty,saving,onDirty]);
  useEffect(()=>{if(!dirty&&!saving){setDraft({text:state.notes.at(-1)?.text||"",age:state.age===null?"":String(state.age),eta:String(state.etaMinutes)});base.current=state.clinicalRevision;}},[state.clinicalRevision,dirty,saving,state.notes,state.age,state.etaMinutes]);
  useEffect(()=>{
    if(!dirty||saving||error)return;
    const timer=setTimeout(()=>{
      const sent=latest.current;setSaving(true);
      void act({action:"notes",actor:persona,text:sent.text,age:sent.age===""?null:Number(sent.age),etaMinutes:Number(sent.eta),expectedRevision:base.current})
      .then(next=>{base.current=next.encounter.clinicalRevision;if(JSON.stringify(latest.current)===JSON.stringify(sent))setDirty(false);})
      .catch(e=>setError(e instanceof Error?e.message:"Could not save field notes."))
      .finally(()=>setSaving(false));
    },800);
    return()=>clearTimeout(timer);
  },[draft,dirty,saving,error,act,persona]);
  const change=(key:keyof typeof draft,value:string)=>{if(!dirty)base.current=state.clinicalRevision;setDirty(true);setDraft(d=>({...d,[key]:value}));};
  return <section className="panel"><div className="panel-heading"><h2><ClipboardList size={18}/> Field notes</h2><span className={"save-state "+(error?"text-error":"")}>{error?"Not saved":saving?"Saving…":dirty?"Unsaved changes":<><Check size={13}/> All changes saved</>}</span></div>
    <div className="input-grid notes-meta"><label className="field-label">Reported age<Input type="number" min="0" max="120" placeholder="Unknown" value={draft.age} onChange={e=>change("age",e.target.value)}/></label><label className="field-label">ETA (minutes)<Input type="number" min="0" max="240" value={draft.eta} onChange={e=>change("eta",e.target.value)}/></label></div>
    <label className="field-label" htmlFor="field-notes">Assessment &amp; updates</label><Textarea id="field-notes" className="notes-input" value={draft.text} maxLength={12000} onChange={e=>change("text",e.target.value)}/>
    {error?<div className="inline-error" role="alert"><p>{error} Your draft is still here.</p><Button variant="outline" size="sm" disabled={saving} onClick={()=>{base.current=state.clinicalRevision;setError("");}}>Save my current draft</Button></div>:null}
    <div className="note-footer"><span>Include findings, changes and treatment already given.</span><span className="muted">{draft.text.length.toLocaleString()} / 12,000</span></div>
  </section>;
}
