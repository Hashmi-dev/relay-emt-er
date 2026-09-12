declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_MIN_INTERVAL_MS?: string;
    GEMINI_RPM_LIMIT?: string;
    GEMINI_RPD_LIMIT?: string;
    ARDUINO_DEMO_KEY?: string;
  }
}
