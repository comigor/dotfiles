import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const home = homedir();
export const plugin = join(home, "Projects/omp-extensions/harness-plugins/omp-memory");
process.env.OMP_MEMORY_STORE ??= join(home, ".omp-memory");
process.env.LAB_STORE ??= process.env.OMP_MEMORY_STORE;
process.env.LAB_USER ??= "Igor";
process.env.LAB_HANDLES ??= "comigor,Igor Borges";
process.env.OMP_MEMORY_MODEL ??= "modal-flash/zai-org/GLM-5.3-Flash";
process.env.PATH = [join(home, ".bun/bin"), process.env.PATH].filter(Boolean).join(delimiter);

// The CLI loads the externally installed plugin after its environment is configured.
if (import.meta.main) await import(join(plugin, "lab/lab.ts"));
