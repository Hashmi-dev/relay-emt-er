import { body, fail, json } from "@/lib/relay/http";
import { createSession } from "@/lib/relay/store";
export async function POST(request: Request) { try { await body(request); const state = await createSession(); return json({ id: state.id }, 201); } catch (e) { return fail(e); } }
