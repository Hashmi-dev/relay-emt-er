import { RelayError } from "./validation";

// A fingerprint is safe to publish. The matching owner key exists only in
// ignored local settings and hosted secrets; this is not a hardware check.
const OWNER_KEY_DIGEST = "4f65bdf2dd20b3fa7a5ad46cdf173806a2cc3d66383889acc6717adfe755dc07";

export async function requireDemoKey(key: string, expectedDigest = OWNER_KEY_DIGEST) {
  if (!key) throw new RelayError("Arduino not found 🙂", 403);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== expectedDigest) throw new RelayError("Arduino not found 🙂", 403);
}
