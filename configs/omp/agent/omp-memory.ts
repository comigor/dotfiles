import { completeSimple } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { plugin } from "./omp-memory-config";

export default async function memoryExtension(pi: ExtensionAPI): Promise<void> {
  // The plugin path is machine-local and its environment must be set before import.
  const { bindRuntime } = await import(join(plugin, "lab/omp-bridge.ts"));
  pi.on("session_start", (_event, ctx) => bindRuntime(ctx.modelRegistry, completeSimple));
  const { default: memory } = await import(join(plugin, "index.ts"));
  return memory(pi);
}
