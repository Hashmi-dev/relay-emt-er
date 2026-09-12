export type Role = "emt" | "lead" | "staff";
export type StaffRole = "emt" | "lead" | "charge" | "trauma_nurse" | "or_nurse" | "blood_bank" | "trauma_surgeon" | "orthopedics" | "radiology";
export type Category = "trauma_bay" | "trauma_nursing" | "blood_bank" | "trauma_assessment" | "orthopedic_consult" | "imaging_readiness" | "or_standby";
export type TaskStatus = "sent" | "acknowledged" | "ready" | "blocked" | "superseded";
export interface Person { id: string; name: string; role: StaffRole; label: string; initials: string; available: boolean }
export interface Room { id: string; label: string; kind: "trauma" | "or" | "ct"; status: "available" | "occupied" | "reserved"; reservation?: string }
export interface Vitals { hr: number | null; sbp: number | null; dbp: number | null; rr: number | null; spo2: number | null; temp: number | null; gcs: number | null }
export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
export interface Observation { id: string; at: string; source: "simulated"; values: Vitals; author: string }
export interface Note { id: string; text: string; at: string; author: string }
export interface Handoff { age: string; time: string; mechanism: string; injuries: string; signs: string; treatment: string }
export interface ProposedTask { category: Category; personId: string; roomId: string | null; rationale: string; evidenceIds: string[] }
export interface Proposal { summary: string; concerns: string[]; unknowns: string[]; conflicts: string[]; handoff: Handoff; tasks: ProposedTask[] }
export interface Plan extends Proposal { id: string; clinicalRevision: number; resourceRevision: number; createdAt: string; source: "gemini" | "rehearsal"; model: string; approvedAt?: string; approvedBy?: string; editedBy?: string }
export interface Assignment extends ProposedTask { id: string; planId: string; instruction: string; status: TaskStatus; updatedAt: string; statusNote: string; history: { status: TaskStatus; at: string; actor: string; note: string }[]; brief: { situation: string; background: string; assessment: string; recommendation: string } }
export interface TimelineEvent { id: string; at: string; actor: string; kind: string; text: string }
export interface AgentState { status: "idle" | "running" | "error"; runId: string | null; startedAt: string | null; nextAllowedAt: number; error: string | null; lastEvaluatedRevision: number; requests: number }
export interface EncounterState { id: string; createdAt: string; clinicalRevision: number; resourceRevision: number; patientId: string; age: number | null; etaMinutes: number | null; bloodTypeReported: BloodType | null; incidentAt: string; notes: Note[]; observations: Observation[]; people: Person[]; rooms: Room[]; plans: Plan[]; assignments: Assignment[]; events: TimelineEvent[]; agent: AgentState; scenario: "initial" | "worsening" }
export interface TelemetryFrame { seq: number; uptimeMs: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }
export interface Telemetry extends TelemetryFrame { receivedAt: string }
export interface Snapshot { encounter: EncounterState; telemetry: Telemetry | null; config: { liveAvailable: boolean; model: string; minIntervalMs: number }; serverTime: string }
export type Command =
  | { action: "notes"; actor: string; text: string; age: number | null; etaMinutes: number | null; bloodTypeReported?: BloodType | null; expectedRevision: number }
  | { action: "observations"; actor: string; values: Vitals; expectedRevision: number }
  | { action: "temperature"; actor: string; value: number; expectedRevision: number }
  | { action: "scan-access"; actor: string }
  | { action: "scenario"; actor: string; stage: "worsening"; expectedRevision: number }
  | { action: "evaluate"; actor: string; mode: "gemini" | "rehearsal"; force?: boolean }
  | { action: "edit-plan"; actor: string; planId: string; proposal: Proposal }
  | { action: "approve"; actor: string; planId: string }
  | { action: "task"; actor: string; taskId: string; status: "acknowledged" | "ready" | "blocked"; note: string }
  | { action: "resource"; actor: string; kind: "person" | "room"; id: string; available: boolean }
  | { action: "reset"; actor: string; expectedRevision: number }
  | { action: "telemetry"; actor: string; frame: TelemetryFrame };
