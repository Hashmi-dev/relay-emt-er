import { frameSchema } from "./validation";
import type { TelemetryFrame } from "./types";

export class SerialFrameDecoder {
  private buffer = "";
  private decoder = new TextDecoder();
  invalid = 0;
  push(chunk: Uint8Array): TelemetryFrame[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    if (this.buffer.length > 16384) { this.buffer = ""; this.invalid++; return []; }
    const lines = this.buffer.split("\n"); this.buffer = lines.pop() || "";
    const frames: TelemetryFrame[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { const parsed = frameSchema.safeParse(JSON.parse(line)); if(parsed.success) frames.push(parsed.data); else this.invalid++; } catch { this.invalid++; }
    }
    return frames;
  }
}
export interface RelaySerialPort { readable: ReadableStream<Uint8Array> | null; open(options:{baudRate:number}):Promise<void>; close():Promise<void> }
export interface RelaySerial { requestPort():Promise<RelaySerialPort> }
export function serialApi(): RelaySerial | undefined { return (navigator as Navigator & { serial?:RelaySerial }).serial; }
