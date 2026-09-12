"use client";
import { useState, type CSSProperties } from "react";
import { Activity, Pause, Play } from "lucide-react";
import type { Vitals } from "@/lib/relay/types";

const traces = {
  hr: "M0 37 L13 37 Q17 28 21 37 L28 37 L31 42 L35 9 L39 61 L44 37 L56 37 Q66 23 77 37 L100 37",
  bp: "M0 58 C10 58 14 58 19 16 C21 7 27 11 31 18 C39 29 41 33 44 34 L48 29 C51 34 52 38 57 40 C73 47 85 57 100 58",
  spo2: "M0 56 C8 56 13 53 18 31 C24 9 33 13 39 24 C45 32 48 34 53 30 C59 29 66 43 72 48 C84 57 91 56 100 56",
};

function Wave({ kind, missing, duration }: { kind: keyof typeof traces; missing: boolean; duration: number }) {
  return <div className="wave-window" aria-hidden="true"><div className={"wave-track " + (missing ? "wave-missing" : "")} style={{ "--trace-duration": duration + "s" } as CSSProperties}>{[0, 1].map(tile => <svg key={tile} viewBox="0 0 600 72" preserveAspectRatio="none">{missing ? <path d="M0 37 H600"/> : Array.from({ length: 6 }, (_, beat) => <path key={beat} d={traces[kind]} transform={"translate(" + beat * 100 + " 0)"}/>)}</svg>)}</div></div>;
}

export function LiveMonitor({ values }: { values: Vitals }) {
  const [paused, setPaused] = useState(false);
  const number = (value: number | null) => value === null ? "—" : Math.round(value);
  const duration = 360 / Math.min(180, Math.max(40, values.hr || 80));
  const rows = [
    { kind: "hr" as const, label: "HR", name: "ECG-style trace", value: number(values.hr), unit: "bpm", missing: values.hr === null || values.hr === 0 },
    { kind: "bp" as const, label: "BP", name: "Pressure-style trace", value: number(values.sbp) + "/" + number(values.dbp), unit: "mmHg", missing: values.sbp === null || values.dbp === null },
    { kind: "spo2" as const, label: "SpO₂", name: "Pleth-style trace", value: number(values.spo2), unit: "%", missing: values.spo2 === null },
  ];
  return <section className={"live-monitor " + (paused ? "monitor-paused" : "")} aria-label="Simulated patient monitor">
    <div className="monitor-heading"><div><Activity size={16}/><h2>Patient monitor</h2><span className="monitor-badge">Simulated waveforms</span></div><button className="monitor-toggle" onClick={() => setPaused(p => !p)} aria-label={paused ? "Resume monitor animation" : "Pause monitor animation"}>{paused ? <Play size={13}/> : <Pause size={13}/>}<span>{paused ? "Resume" : "Pause"}</span></button></div>
    {rows.map(row => <div className={"monitor-row trace-" + row.kind} key={row.kind}><div className="trace-label"><strong>{row.label}</strong><small>{row.name}</small></div><Wave kind={row.kind} duration={duration} missing={row.missing}/><div className="trace-number"><strong>{row.value}</strong><small>{row.unit}</small></div></div>)}
    <p className="monitor-footnote">Illustrative animation · Numbers reflect the latest simulated observations.</p>
  </section>;
}
