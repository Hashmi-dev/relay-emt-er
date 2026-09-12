import { body, checkId, fail, json } from "@/lib/relay/http";
import { commands, RelayError } from "@/lib/relay/validation";
import { clearTelemetry, mutateSession, readSession, saveTelemetry, setting, snapshot } from "@/lib/relay/store";
import { requireDemoKey } from "@/lib/relay/demo-access";
import { applyCommand, requireActor } from "@/lib/relay/workflow";
import { evaluate } from "@/lib/relay/agent";
import type { Command } from "@/lib/relay/types";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { id, action } = await context.params; checkId(id);
    if (!Object.hasOwn(commands, action)) throw new RelayError("Unknown action.", 404);
    const parsed = commands[action as keyof typeof commands].parse(await body(request));
    const command = { action, ...parsed } as Command;
    if (command.action === "scan-access" || command.action === "temperature") await requireDemoKey(setting("ARDUINO_DEMO_KEY"));
    if (command.action === "scan-access") {
      const { state } = await readSession(id); requireActor(state, command.actor, ["emt"]);
    } else if (command.action === "evaluate") await evaluate(id, command.actor, command.mode, command.force);
    else if (command.action === "telemetry") {
      const { state } = await readSession(id); requireActor(state, command.actor, ["emt"]);
      await saveTelemetry(id, command.frame);
      return json({ ok: true });
    } else {
      await mutateSession(id, state => applyCommand(state, command));
      if (command.action === "reset") await clearTelemetry(id);
    }
    return json(await snapshot(id));
  } catch (e) { return fail(e); }
}
