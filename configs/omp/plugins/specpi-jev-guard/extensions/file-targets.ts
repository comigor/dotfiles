import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export function fileTargets(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  if ("path" in input && typeof input.path === "string") return input.path ? [input.path] : [];
  if (!("input" in input) || typeof input.input !== "string") return [];

  const targets = new Set<string>();
  let hasSection = false;
  for (const line of input.input.split(/\r?\n/)) {
    if (line.startsWith("+") || line.trim() === "" || line === "*** Begin Patch" || line === "*** End Patch") continue;
    const header = /^\[(.+)#[0-9A-Fa-f]{4}\]$/.exec(line);
    if (header) {
      targets.add(header[1]);
      hasSection = true;
      continue;
    }
    if (!hasSection) return [];
    if (line.startsWith("MV ")) {
      const destination = line.slice(3).trim();
      const quoted = /^(?:"([^"\r\n]+)"|'([^'\r\n]+)')$/.exec(destination);
      if (quoted) targets.add(quoted[1] ?? quoted[2]);
      else if (/^[^\s"'\\]+$/.test(destination)) targets.add(destination);
      else return [];
    } else if (!/^(?:PUT |CUT |REM$)/.test(line)) {
      return [];
    }
  }
  return [...targets];
}

export function canonicalTarget(target: string, cwd: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
  const expanded = target.startsWith("~/") ? join(homedir(), target.slice(2)) : target;
  let path = resolve(cwd, expanded);
  const missing: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(path), ...missing);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      try {
        if (lstatSync(path).isSymbolicLink()) throw new Error(`Cannot resolve symlink target: ${path}`);
      } catch (statError) {
        if (!(statError instanceof Error) || !("code" in statError) || statError.code !== "ENOENT") throw statError;
      }
      const parent = dirname(path);
      if (parent === path) throw error;
      missing.unshift(path.slice(parent.length).replace(/^[/\\]/, ""));
      path = parent;
    }
  }
}
