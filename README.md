# Relay

An EMT-to-ER preparation and handoff prototype. One field update becomes an evidence-linked ATMIST report and proposed receiving-team preparations. **The ER lead approves dispatch.** Each fictional staff member acknowledges readiness in their own linked view.

Built from a fresh Sites React/TypeScript + shadcn starter, with a Cloudflare Worker, D1 persistence, the official Google GenAI SDK, and Arduino USB telemetry.

## Run locally

Requirements: Node.js 22.13 or newer (Node 24 recommended), npm, and desktop Chrome or Edge for USB serial.

```sh
npm run install:ci
```

Copy `.env.example` to `.env.local`. Create a key at [Google AI Studio](https://aistudio.google.com/api-keys) and enter it after `GEMINI_API_KEY=`. Keep it in the server environment; never paste it into client code or use a `VITE_` / `NEXT_PUBLIC_` prefix. Billing is not required for models with an available free tier. Verify your project-specific quotas in AI Studio; do not enable paid billing just to rehearse.

`GEMINI_MODEL` defaults to `gemini-3.8-flash`. During implementation this model returned temporary capacity errors; `gemini-3.5-flash` completed a live coordination plan in about ten seconds. You may explicitly set `GEMINI_MODEL=gemini-3.5-flash` if your project has access. The UI labels the model used for every report. There is no silent model or scripted fallback.

```sh
npm run key:local
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_dazzling_the_twelve.sql
npm run dev
```

Apply that migration only once to a fresh local database. Development opens at `http://localhost:5173`. A built preview uses `npm start`. Both share `.wrangler/state`. `.env.local`, `.dev.vars`, runtime state and artifacts are ignored by Git. `npm run key:local` copies only the configured server environment into the ignored Worker secrets file without printing the key.

## Demo flow

1. Open Relay to create a session. Keep its `session` query parameter when sharing persona links.
2. In EMT, edit the report and ETA. Notes save after an 800 ms pause. Simulated observations can be edited or advanced with **Add worsening update**.
3. With a key configured, Gemini runs after a three-second pause, at most once every fifteen seconds per encounter. Motion samples never trigger evaluation.
4. Open **ER lead**. Review the ATMIST report, concerns, unknowns, contradictions, and source evidence. Edit the proposal if needed, then **Approve and dispatch**.
5. Open a team member's link in another tab or browser. Select **Acknowledge**, **Ready**, or **Blocked** with an explanation. The lead receives updates through two-second polling.
6. Advance the scenario. The new report needs approval; existing assignments retain their status history. Only approved personnel/location/category changes replace assignments.

**Scripted rehearsal** is an explicitly selected fixed crash fixture for testing without a model. It does not interpret arbitrary notes. Use the live Gemini agent for the submitted recording. A 2:45 recording outline is in [docs/demo-script.md](docs/demo-script.md).

Persona IDs: `maya`, `ben`, `sofia`, `lena`, `owen`, `sam`, `marcus`, `nina`, `ethan`, `priya`. Example: `/?session=<existing-session-id>&persona=lena`. The role switcher is a simulation convenience, not production authentication. Anyone with access to a session may select any persona.

## Arduino Nano 33 BLE Rev2

1. Install Arduino IDE and the **Arduino Mbed OS Nano Boards** board package.
2. Install **Arduino_BMI270_BMM150** through Library Manager.
3. Open [arduino/relay_motion/relay_motion.ino](arduino/relay_motion/relay_motion.ino), select **Arduino Nano 33 BLE** and its USB port, and upload.
4. Close Serial Monitor so it releases the port. Open the EMT view in desktop Chrome/Edge on localhost or HTTPS. Click **Connect Arduino**, select the board, and move it.

The sketch emits newline-delimited JSON at 115200 baud, five frames per second:

```json
{"seq":1,"uptimeMs":200,"ax":0.1,"ay":0.2,"az":1.0,"gx":0.0,"gy":0.0,"gz":0.0}
```

Acceleration is in g, gyroscope values in degrees/second. The browser summarizes the latest reading once per second, reconstructs partial lines, discards malformed data and shows stale status after five seconds without readings. Real motion is labeled **Live device motion**. HR, BP, RR, SpO2, temperature and GCS are **Simulated**. This board does not measure those patient vitals.

The protocol parser and backend isolation are tested. Compilation/upload and physical movement require the actual board and were not verified during the automated build.

## How the agent works

The backend preloads notes, observations, the fictional resource roster, existing assignments and a bounded preparation catalog. Gemini can call only `read_resources` and `save_draft_plan`. A normal update needs one model request; each evaluation permits at most three. Zod validates all plan fields, staff roles, availability, room types, task categories and evidence references. Task instructions come from the canonical preparation catalog, not unrestricted model text.

The model has no approval tool. Approval checks the reviewed plan ID and clinical/resource revisions again. D1 stores one encounter document with an optimistic compare-and-swap version; updating assignments and room reservations is one atomic write. Concurrent repeated approvals are idempotent. Telemetry has a separate table and does not change clinical revisions. Site-wide quota counters limit model requests across sessions (default 8/minute and 150/day; configure to your actual quota). In-flight leases expire after 75 seconds. Encounter history is bounded for a short demo; reset after 80 plan revisions or 150 note/observation entries.

Provider failures preserve the last report and dispatched assignments, visibly mark the report stale and keep manual changes available. Capacity, quota and access errors receive distinct messages. Notes are treated as untrusted evidence. The server validates reference existence; a human must still verify whether an AI rationale is clinically supported.

## API

All changes use JSON POST bodies; snapshots use GET. Typed commands are defined in `lib/relay/types.ts` and strict schemas in `lib/relay/validation.ts`.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/sessions` | Create a fictional encounter session |
| `GET /api/sessions/:id` | Encounter, assignments, telemetry and public configuration |
| `POST /api/sessions/:id/notes` | Autosave note, reported age and ETA with expected revision |
| `POST /api/sessions/:id/observations` | Add simulated observations; missing values may be null |
| `POST /api/sessions/:id/evaluate` | Live Gemini evaluation or explicit rehearsal |
| `POST /api/sessions/:id/edit-plan` | Lead-reviewed proposal creates a new draft ID |
| `POST /api/sessions/:id/approve` | Lead approval, atomic reservation and dispatch |
| `POST /api/sessions/:id/task` | Assigned persona status and blocker note |
| `POST /api/sessions/:id/resource` | Lead changes available staff/rooms |
| `POST /api/sessions/:id/telemetry` | Validated motion frame, separate from patient vitals |
| `POST /api/sessions/:id/scenario` | Add worsening crash observations |
| `POST /api/sessions/:id/reset` | Reset only this linked session |

## Validation

```sh
npm run typecheck
npm test
node scripts/integration-check.mjs
npm run build
```

Run the integration check against a running local server; it creates its own disposable session and uses the explicitly labeled rehearsal fixture. It verifies persistence, persona role checks, concurrent duplicate approval, staff readiness, telemetry/vital isolation, stale edits, and reset. Unit tests cover invalid evidence, incompatible specialties, occupied resources, plan edits, assignment replacement/history, blocked status and serial framing.

`node scripts/check-gemini.mjs` verifies model access without printing the key. `node scripts/smoke-gemini.mjs [model]` makes a small real function-call request and prints a sanitized result. These consume API requests. Live model quality and latency vary with provider capacity.

## Hosting and secrets

The project uses the Sites Worker/D1 hosting contract in `.openai/hosting.json`; it contains logical bindings and the site ID, never credentials. Build output is `dist/server` and `dist/client`; generated SQL migrations are under `drizzle`. Configure `GEMINI_API_KEY` as a **secret** in the hosted server environment, plus `GEMINI_MODEL` and optional quota settings, then publish the validated build and migrations. A local `.env.local` does not configure hosting.

Sites publication starts private. Share access intentionally before giving judges hosted persona links. Source can be public independently; no API key or encounter database belongs in the public repository.

## Scope and clinical boundaries

All names, patients, rooms, vitals and assignments are fictional. Relay proposes preparation and communication tasks; it does not diagnose, prescribe, select blood products, order CT or authorize surgery. Blood type is always unverified until hospital testing/workflow confirms it. OR is conditional standby. Retain a brief clinician-to-clinician arrival confirmation. This demo is not suitable for actual patient care or real patient information. The free Gemini tier may use submitted content to improve Google products.

## References

- [Arduino Nano 33 BLE Rev2 hardware](https://docs.arduino.cc/hardware/nano-33-ble-rev2)
- [Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial)
- [ATMIST in UHS adult major-trauma guidance](https://www.uhs.nhs.uk/Media/SUHTExtranet/WessexTraumaNetwork/UHS-adult-major-trauma-guidelines.pdf)
- [AHRQ SBAR](https://www.ahrq.gov/teamstepps-program/resources/additional/sbar.html)
- [Pre-transfusion testing](https://professionaleducation.blood.ca/en/transfusion/clinical-guide/pre-transfusion-testing)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
