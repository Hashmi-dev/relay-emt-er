import { readFileSync, writeFileSync } from "node:fs";
const input = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const allowed = new Set(["GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_MIN_INTERVAL_MS", "GEMINI_RPM_LIMIT", "GEMINI_RPD_LIMIT", "ARDUINO_DEMO_KEY"]);
const lines = input.split(/\r?\n/).filter(line => allowed.has(line.split("=", 1)[0].trim()));
const key = lines.find(line => line.startsWith("GEMINI_API_KEY="))?.slice("GEMINI_API_KEY=".length).trim();
if (!key || key.includes("YOUR_KEY")) throw new Error("Add the Gemini API key to .env.local first. Do not paste it in chat.");
writeFileSync(new URL("../.dev.vars", import.meta.url), lines.join("\n") + "\n", { mode: 0o600 });
console.log("Local Worker secrets configured. Restart the preview to apply them. No key was printed.");
