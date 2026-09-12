import type { Category, EncounterState, Person, Room, StaffRole, Vitals } from "./types";

export const PEOPLE: Person[] = [
  { id: "maya", name: "Maya Chen", role: "emt", label: "Paramedic · Medic 12", initials: "MC", available: true },
  { id: "ben", name: "Ben Ortiz", role: "emt", label: "EMT · Medic 12", initials: "BO", available: true },
  { id: "sofia", name: "Dr. Sofia Reyes", role: "lead", label: "ER lead", initials: "SR", available: true },
  { id: "lena", name: "Lena Brooks, RN", role: "charge", label: "Charge nurse", initials: "LB", available: true },
  { id: "owen", name: "Owen Reed, RN", role: "trauma_nurse", label: "Trauma nurse", initials: "OR", available: true },
  { id: "sam", name: "Sam Patel", role: "blood_bank", label: "Blood-bank technologist", initials: "SP", available: true },
  { id: "marcus", name: "Dr. Marcus Lee", role: "trauma_surgeon", label: "Trauma surgeon", initials: "ML", available: true },
  { id: "nina", name: "Dr. Nina Park", role: "orthopedics", label: "Orthopedics", initials: "NP", available: true },
  { id: "ethan", name: "Dr. Ethan Shaw", role: "radiology", label: "Radiology", initials: "ES", available: true },
  { id: "priya", name: "Priya Shah, RN", role: "or_nurse", label: "Operating-room nurse", initials: "PS", available: true },
];
export const ROOMS: Room[] = [
  { id: "T1", label: "Trauma T1", kind: "trauma", status: "occupied" },
  { id: "T2", label: "Trauma T2", kind: "trauma", status: "available" },
  { id: "OR-3", label: "OR-3 · Standby", kind: "or", status: "available" },
  { id: "OR-4", label: "OR-4", kind: "or", status: "occupied" },
  { id: "CT-1", label: "CT-1 · Readiness", kind: "ct", status: "available" },
];
export const TASKS: Record<Category, { title: string; role: StaffRole; room: Room["kind"] | null; instruction: string }> = {
  trauma_bay: { title: "Prepare receiving bay", role: "charge", room: "trauma", instruction: "Confirm receiving-bay availability and coordinate the approved team. Confirm patient identity and the brief arrival handoff." },
  trauma_nursing: { title: "Prepare trauma nursing station", role: "trauma_nurse", room: "trauma", instruction: "Check the monitoring, warming and standard trauma equipment against the local readiness checklist. Receive the EMT observations and treatment history." },
  blood_bank: { title: "Coordinate blood-bank readiness", role: "blood_bank", room: null, instruction: "Prepare for an urgent blood-bank assessment. Blood type is unverified. Arrange identity, sample and compatibility checks; product selection and release require the local authorized clinical workflow." },
  trauma_assessment: { title: "Prepare surgical assessment", role: "trauma_surgeon", room: "trauma", instruction: "Review the reported injuries and changing observations. Be available for assessment on arrival; determine imaging and operative needs with the ER lead." },
  orthopedic_consult: { title: "Prepare orthopedic consultation", role: "orthopedics", room: "trauma", instruction: "Review the reported suspected fracture and be available for consultation. Confirm findings and the clinical plan with the receiving team." },
  imaging_readiness: { title: "Check imaging readiness", role: "radiology", room: "ct", instruction: "Confirm imaging readiness and communicate availability. The ER lead and treating clinicians determine the examination, timing and suitability of transfer." },
  or_standby: { title: "Coordinate conditional OR standby", role: "or_nurse", room: "or", instruction: "Check conditional operating-room readiness with the surgical team and standard equipment checklist. Standby is not authorization for an operation or patient transfer." },
};
export const INITIAL_NOTES = "Adult, approx. 34 years. Restrained driver in a motor vehicle collision. Significant bleeding reported; left leg deformity with suspected fracture. Awake, confused. Blood type, allergies and medications unknown. Treatment details not yet documented.";
export const INITIAL_VITALS: Vitals = { hr: 132, sbp: 86, dbp: 54, rr: 28, spo2: 93, temp: 35.5, gcs: 13 };
export const WORSENING_VITALS: Vitals = { hr: 144, sbp: 78, dbp: 46, rr: 32, spo2: 91, temp: 35.3, gcs: 12 };
export const DEFINITIONS: Record<string, string> = { HR: "Heart rate · beats per minute", BP: "Blood pressure · systolic / diastolic, mmHg", RR: "Respiratory rate · breaths per minute", "SpO₂": "Peripheral oxygen saturation · percent", Temp: "Patient temperature · degrees Celsius", GCS: "Glasgow Coma Scale · reported total out of 15", ETA: "Estimated time of arrival", ED: "Emergency department", OR: "Operating room", CT: "Computed tomography" };

export function createEncounter(id: string, now = new Date().toISOString()): EncounterState {
  return { id, createdAt: now, clinicalRevision: 1, resourceRevision: 1, patientId: "TRAUMA-001", age: 34, etaMinutes: 8, incidentAt: new Date(Date.parse(now) - 18 * 60_000).toISOString(),
    notes: [{ id: "note-1", text: INITIAL_NOTES, at: now, author: "maya" }], observations: [{ id: "obs-1", at: now, source: "simulated", values: { ...INITIAL_VITALS }, author: "maya" }],
    people: structuredClone(PEOPLE), rooms: structuredClone(ROOMS), plans: [], assignments: [], scenario: "initial",
    events: [{ id: crypto.randomUUID(), at: now, actor: "maya", kind: "intake", text: "Medic 12 opened the fictional crash encounter." }],
    agent: { status: "idle", runId: null, startedAt: null, nextAllowedAt: 0, error: null, lastEvaluatedRevision: 0, requests: 0 },
  };
}
