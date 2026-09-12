import { checkId, fail, json } from "@/lib/relay/http";
import { snapshot } from "@/lib/relay/store";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; checkId(id); return json(await snapshot(id)); } catch (e) { return fail(e); } }
