"use client";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Command, EncounterState, Snapshot } from "@/lib/relay/types";

const sampleTemperature = () => (345 + Math.floor(Math.random() * 15)) / 10;

export function TemperaturePanel({ state, persona, act, disabled, onScanning }: {
  state: EncounterState; persona: string; act: (command: Command) => Promise<Snapshot>;
  disabled: boolean; onScanning: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "scanning" | "saving" | "done">("idle");
  const [preview, setPreview] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current) clearInterval(timer.current); };
  }, []);
  const active = phase === "scanning" || phase === "saving";
  const scan = () => {
    if (disabled || working.current) return;
    working.current = true;
    const revision = state.clinicalRevision;
    setError(""); setPhase("scanning"); setProgress(0); setPreview(sampleTemperature()); onScanning(true);
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - started;
      setPreview(sampleTemperature()); setProgress(Math.min(100, elapsed / 26));
      if (elapsed < 2600) return;
      clearInterval(timer.current!); timer.current = null;
      const value = sampleTemperature(); setPreview(value); setPhase("saving");
      // Only the settled value is submitted; animation frames stay in this browser.
      void act({ action: "temperature", actor: persona, value, expectedRevision: revision })
        .then(() => { if (mounted.current) setPhase("done"); })
        .catch(e => { if (mounted.current) { setError(e instanceof Error ? e.message : "Could not save the demo temperature."); setPhase("idle"); setPreview(null); } })
        .finally(() => { working.current = false; if (mounted.current) onScanning(false); });
    }, 90);
  };
  const value = active ? preview : state.observations.at(-1)?.values.temp;
  return <section className="panel temperature-panel">
    <div className="panel-heading"><h2><Thermometer size={18}/> Temperature scan</h2><span className="pill neutral">Simulated</span></div>
    <p className="muted">Take a demo reading for the crash scenario.</p>
    <div className={"temperature-readout " + (active ? "is-scanning" : "")}>
      <div><span className="temperature-label">BODY TEMPERATURE</span><output aria-label="Demo temperature">{value == null ? "—" : value.toFixed(1)}<small>°C</small></output></div>
      <div className="temperature-status" role="status">{phase === "scanning" ? <><LoaderCircle size={16} className="spin"/> Taking reading…</> : phase === "saving" ? <><LoaderCircle size={16} className="spin"/> Saving reading…</> : phase === "done" ? <><Check size={16}/> Reading saved</> : "Ready to scan"}</div>
    </div>
    <div className="scan-progress" aria-hidden="true"><span style={{ width: active ? progress + "%" : "0%" }}/></div>
    <div className="temperature-actions"><Button onClick={scan} disabled={disabled || active}>{active ? <LoaderCircle className="spin"/> : <Thermometer/>}{active ? "Scanning…" : "Take temperature"}</Button><small className="muted">Demo range 34.5–35.9°C · No sensor connected</small></div>
    {error ? <p className="inline-error" role="alert">{error} The saved temperature has not changed.</p> : null}
  </section>;
}
