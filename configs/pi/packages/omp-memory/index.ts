/**
 * omp-memory on Pi-Bolt: long-term memory across sessions. It observes every turn,
 * consolidates the journal into preferences, principles, project decisions and
 * skills ("dream"), and recalls them at session start and after compaction.
 *
 * The plugin lives in a checkout of decade-eng/omp-extensions. This wrapper sets its
 * environment before loading it, as configs/omp/agent/omp-memory.ts does for omp, and
 * both hosts share one store (~/.omp-memory). Declared under piBolt.packages, so a
 * stock `pi` sharing ~/.pi/agent does not load it.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const plugin = process.env.OMP_MEMORY_PLUGIN ?? join(home, "Projects/omp-extensions/harness-plugins/omp-memory");

export default async function memoryExtension(pi: ExtensionAPI): Promise<void> {
  if (!existsSync(join(plugin, "index.ts"))) {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI) ctx.ui.notify(`omp-memory: no plugin at ${plugin}; clone decade-eng/omp-extensions to ~/Projects`, "warning");
    });
    return;
  }
  // The plugin reads these when its modules load.
  process.env.OMP_MEMORY_STORE ??= join(home, ".omp-memory");
  process.env.LAB_STORE ??= process.env.OMP_MEMORY_STORE;
  process.env.LAB_USER ??= "Igor";
  process.env.LAB_HANDLES ??= "comigor,Igor Borges";
  // Observer and dream model: the id is what matters, a provider rename keeps resolving.
  process.env.OMP_MEMORY_MODEL ??= "modal-glm-flash/zai-org/GLM-5.3-Flash";
  const { default: memory } = await import(join(plugin, "index.ts"));
  return memory(pi);
}
