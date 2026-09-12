# Relay

An EMT-to-ER preparation and handoff prototype. One field update becomes an evidence-linked ATMIST report and proposed receiving-team preparations. **The ER lead approves dispatch.** Each fictional staff member acknowledges readiness in their own linked view.

Built from a fresh Sites React/TypeScript + shadcn starter, with a Cloudflare Worker, D1 persistence, the official Google GenAI SDK, and simulated patient-monitor visuals.

## Run locally

Requirements: Node.js 22.13 or newer (Node 24 recommended), npm, and a modern browser. The current demo requires no Arduino hardware.

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
2. In EMT, edit the optional age, ETA, reported blood type and assessment. Any field can remain blank; blank measurements are unknown. Notes save after an 800 ms pause. Click **Take temperature** to cycle demo readings for about 2.6 seconds, then save one simulated value in the fictional 34.5–35.9°C range. This is a chosen demo range, not a clinical blood-loss rule.
3. HR, BP and SpO₂ have continuously animated illustrative waveforms with Pause/Resume and reduced-motion support. Numeric cards show the latest simulated observations, rounded to whole numbers except temperature (one decimal). Animations never create observations or call the agent. With a key configured, Gemini reviews saved changes after a three-second pause, at most once every fifteen seconds per encounter.
4. Open **ER lead**. Review the ATMIST report, concerns, unknowns, contradictions, and source evidence. Edit the proposal if needed, then **Approve and dispatch**.
5. Open a team member's link in another tab or browser. Select **Acknowledge**, **Ready**, or **Blocked** with an explanation. The lead receives updates through two-second polling.
6. Advance the scenario. The new report needs approval; existing assignments retain their status history. Only approved personnel/location/category changes replace assignments.

The workspace uses the live Gemini agent; the scripted rehearsal control has been removed. A fixed fixture remains accessible to the integration test through the API, with explicit provenance, and never acts as an automatic fallback. A 2:45 recording outline is in [docs/demo-script.md](docs/demo-script.md).

Persona IDs: `maya`, `ben`, `sofia`, `lena`, `owen`, `sam`, `marcus`, `nina`, `ethan`, `priya`. Example: `/?session=<existing-session-id>&persona=lena`. The role switcher is a simulation convenience, not production authentication. Anyone with access to a session may select any persona.

## Arduino Nano 33 BLE Rev2 (retained for future hardware integration)

The current EMT interface replaces the USB motion panel with a **Simulated temperature scan**. It makes no hardware connection. The original motion sketch, serial parser and telemetry endpoint remain in the repository for later use.

The scan is enabled only in the owner's configured demo deployment. Its private `ARDUINO_DEMO_KEY` lives in ignored `.env.local` for local development and a hosted server secret. The repository contains only its verification fingerprint. A fresh clone, a blank key, or an incorrect key such as `123` returns **Arduino not found 🙂** before cycling temperatures; the server also rejects direct scan saves. The example environment file deliberately leaves the key blank. This gates the demo installation, not a physical device or individual browser. Source-code changes can remove the gate. Manual observation entry and the rest of Relay still work without the private key.

1. Install Arduino IDE and the **Arduino Mbed OS Nano Boards** board package.
2. Install **Arduino_BMI270_BMM150** through Library Manager.
3. Open [arduino/relay_motion/relay_motion.ino](arduino/relay_motion/relay_motion.ino), select **Arduino Nano 33 BLE** and its USB port, and upload.
4. Use Arduino Serial Monitor at 115200 baud to inspect motion frames. The current website does not expose a Connect Arduino control.

The sketch emits newline-delimited JSON at 115200 baud, five frames per second:

```json
{"seq":1,"uptimeMs":200,"ax":0.1,"ay":0.2,"az":1.0,"gx":0.0,"gy":0.0,"gz":0.0}
```

Acceleration is in g, gyroscope values in degrees/second. The retained parser reconstructs partial lines and rejects malformed frames. HR, BP, RR, SpO2, temperature and GCS are **Simulated**. This board does not measure those patient vitals.

The protocol parser and backend isolation are tested. Compilation/upload and physical movement require the actual board and were not verified during the automated build.

## How the agent works

The backend preloads notes, observations, the fictional resource roster, existing assignments and a bounded preparation catalog. Gemini can call only `read_resources` and `save_draft_plan`. A normal update needs one model request; each evaluation permits at most three. Zod validates all plan fields, staff roles, availability, room types, task categories and evidence references. Task instructions come from the canonical preparation catalog, not unrestricted model text.

The model has no approval tool. Approval checks the reviewed plan ID and clinical/resource revisions again. D1 stores one encounter document with an optimistic compare-and-swap version; updating assignments and room reservations is one atomic write. Concurrent repeated approvals are idempotent. Telemetry has a separate table and does not change clinical revisions. Site-wide quota counters limit model requests across sessions (default 8/minute and 150/day; configure to your actual quota). Each model request has a 30-second deadline and uses low thinking effort. In-flight leases expire after 105 seconds, covering the three-request bound. Encounter history is bounded for a short demo; reset after 80 plan revisions or 150 note/observation entries.

Provider failures preserve the last report and dispatched assignments, visibly mark the report stale and keep manual changes available. Capacity, quota and access errors receive distinct messages. Notes are treated as untrusted evidence. The server validates reference existence; a human must still verify whether an AI rationale is clinically supported.

## API

All changes use JSON POST bodies; snapshots use GET. Typed commands are defined in `lib/relay/types.ts` and strict schemas in `lib/relay/validation.ts`.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/sessions` | Create a fictional encounter session |
| `GET /api/sessions/:id` | Encounter, assignments, telemetry and public configuration |
| `POST /api/sessions/:id/notes` | Autosave optional note, age, ETA and reported blood type with expected revision |
| `POST /api/sessions/:id/observations` | Add simulated observations; missing values may be null |
| `POST /api/sessions/:id/temperature` | Save a settled demo temperature only; preserve other observations and reject stale revisions |
| `POST /api/sessions/:id/scan-access` | Check private scan setup and EMT persona before starting the simulation; makes no encounter changes |
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

For a clone without the private scan key, set `RELAY_SCAN_LOCKED=1` when running the integration check; it verifies both the scan-access and direct-temperature endpoints reject the attempt without changing observations. The default integration path verifies the owner's enabled scan.

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
