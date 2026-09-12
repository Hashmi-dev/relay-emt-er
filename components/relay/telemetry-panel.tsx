"use client";
import { useEffect, useRef, useState } from "react";
import { Cpu, Plug, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/relay/client";
import { SerialFrameDecoder, serialApi, type RelaySerialPort } from "@/lib/relay/serial";
import type { Telemetry, TelemetryFrame } from "@/lib/relay/types";

export function TelemetryPanel({sessionId,persona,telemetry,canConnect}:{sessionId:string;persona:string;telemetry:Telemetry|null;canConnect:boolean}) {
  const [connected,setConnected]=useState(false); const [connecting,setConnecting]=useState(false); const [error,setError]=useState(""); const [invalid,setInvalid]=useState(0); const [clock,setClock]=useState(Date.now());
  const [local,setLocal]=useState<Telemetry|null>(null);
  const portRef=useRef<RelaySerialPort|null>(null); const readerRef=useRef<ReadableStreamDefaultReader<Uint8Array>|null>(null); const alive=useRef(true); const postTime=useRef(0); const posting=useRef(false);
  const disconnect=async()=>{await readerRef.current?.cancel().catch(()=>{});};
  useEffect(()=>{alive.current=true;const t=setInterval(()=>setClock(Date.now()),1000);return()=>{alive.current=false;clearInterval(t);void readerRef.current?.cancel().catch(()=>{});};},[]);
  const show=connected?local:telemetry; const stale=!show || clock-Date.parse(show.receivedAt)>5000;
  const connect=async()=>{
    const serial=serialApi(); if(!serial){setError("Use desktop Chrome or Edge in a secure window for USB serial.");return;}
    setConnecting(true);setError("");
    try {
      const port=await serial.requestPort(); portRef.current=port;
      await port.open({baudRate:115200}); if(!port.readable)throw new Error("The serial port has no readable stream.");
      setConnected(true);setConnecting(false);const reader=port.readable.getReader();readerRef.current=reader;const decoder=new SerialFrameDecoder();
      try { while(alive.current){const result=await reader.read();if(result.done)break;const frames=decoder.push(result.value);setInvalid(decoder.invalid);const frame=frames.at(-1);if(!frame)continue;
        setLocal({...frame,receivedAt:new Date().toISOString()});
        if(Date.now()-postTime.current>=1000 && !posting.current){postTime.current=Date.now();posting.current=true;
          void api("/api/sessions/"+sessionId+"/telemetry",{actor:persona,frame:frame as TelemetryFrame}).then(()=>{if(alive.current)setError("");}).catch(()=>{if(alive.current)setError("USB is connected, but this reading could not be shared. Retrying on the next sample.");}).finally(()=>{posting.current=false;});
        }
      }} finally {reader.releaseLock();readerRef.current=null;await port.close().catch(()=>{});portRef.current=null;}
    } catch(e){if(alive.current)setError(e instanceof Error?e.message:"Could not connect the Arduino.");await portRef.current?.close().catch(()=>{});portRef.current=null;}
    finally {if(alive.current){setConnected(false);setConnecting(false);}}
  };
  return <section className="panel telemetry-panel"><div className="panel-heading"><h2><Cpu size={18}/> Live device motion</h2><span className={"pill "+(stale?"neutral":"success")}>{stale?(show?"Stale · no recent sample":"Disconnected"):"Receiving"}</span></div>
    <p className="muted">Nano 33 BLE Rev2 · device telemetry, separate from patient vitals.</p>
    <div className="motion-grid">{(["ax","ay","az"] as const).map(axis=><div key={axis}><span>{axis.toUpperCase()}</span><strong>{show?show[axis].toFixed(3):"—"}<small> g</small></strong></div>)}</div>
    <p className="motion-detail">Gyroscope: {show?[show.gx,show.gy,show.gz].map(v=>v.toFixed(1)).join(" / ")+" °/s":"—"} · Frame {show?.seq ?? "—"}{invalid?" · "+invalid+" invalid frames skipped":""}</p>
    {error?<p className="inline-error" role="alert">{error}</p>:null}
    {canConnect?<Button variant="outline" disabled={connecting} onClick={()=>void(connected?disconnect():connect())}>{connected?<Unplug/>:<Plug/>}{connecting?"Connecting…":connected?"Disconnect Arduino":"Connect Arduino"}</Button>:<p className="muted">The EMT browser shares the connected sensor.</p>}
  </section>;
}
