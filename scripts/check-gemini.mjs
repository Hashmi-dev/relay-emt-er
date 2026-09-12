import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const config = parseEnv(readFileSync(".env.local", "utf8"));
if (!config.GEMINI_API_KEY) throw new Error("No key is configured in .env.local.");
try {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": config.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  console.log(JSON.stringify({ ok: response.ok, status: response.status, configuredModel: config.GEMINI_MODEL || "gemini-3.8-flash", availableTextModels: (result.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name), errorCode: result.error?.status }, null, 2));
} catch (error) { console.log(JSON.stringify({ ok: false, errorType: error.name, message: "Provider connectivity check failed; no credentials printed." })); process.exitCode = 1; }
