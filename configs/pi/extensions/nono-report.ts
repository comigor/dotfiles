/**
 * nono-report - the Pi side of running inside nono.
 *
 * The published nono Pi pack already tells the agent it is sandboxed and how to
 * diagnose a denial. This adds what is specific to this machine: the launchers,
 * the profile its grants go into, and a ledger of what the sandbox refused, so a
 * run can report what to allow next time.
 *
 * Active only when NONO_CAP_FILE is set, i.e. only inside 'nono run'.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const GRANTS_FILE = join(HOME, ".config/nono/profiles/pi-local-grants.json");

const DENIAL_PATTERNS = [
  /operation not permitted/i,
  /permission denied/i,
  /EACCES/,
  /EPERM/,
  /landlock/i,
  /sandbox(?:ed)?:?\s+deny/i,
];

const STANDING = [
  "## This session may be sandboxed by nono",
  "",
  "Check it with: echo $NONO_CAP_FILE (set = inside nono). The live policy is the file it names.",
  "",
  "On this machine:",
  "",
  "- Launchers: pi-nono (daily driver, profile pi-local) and pi-nono-gh (adds the gh credential route).",
  "- Workdir and ~/Projects are read-write; everything else under $HOME is denied by design.",
  "- A denial is fixed by a line in a profile, never by retrying, sudo, chmod or chown.",
  "",
  "When a command fails with EPERM, EACCES or Operation not permitted, confirm it is nono with:",
  "",
  "    nono why --self --path <path> --op read     (use --op write for a write failure)",
  "",
  "Finish every reply that hit a denial with a short 'Sandbox denials' list: the blocked path, the",
  "operation, and the exact line that would allow it. For example: $HOME/.kube/config needs",
  "\"$HOME/.kube/config\" under filesystem.read in pi-local-grants.json. Never silently work around a",
  "blocked path; report it.",
].join("\n");

const IMMEDIATE = [
  "[nono] That is the outer sandbox, not a Unix permission problem. On this machine the fix is a",
  "grant line, not a retry or sudo:",
  "",
  "    pi-nono-learn --apply -- <the command that failed>       (in a normal shell, not in here)",
  "",
  "or add the path to ~/.config/nono/profiles/pi-local-grants.json. Keep it for the 'Sandbox",
  "denials' list at the end of your reply.",
].join("\n");

type Hit = {
  path: string;
  op: string;
  reason: string;
  fix: string;
};

const ledger: Hit[] = [];
let announced = 0;

function insideNono(): boolean {
  return Boolean(process.env.NONO_CAP_FILE);
}

function nonoBinary(): string | null {
  const candidates = [process.env.NONO_BIN, "nono", join(HOME, ".local/bin/nono")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === "nono" || existsSync(candidate)) return candidate;
  }
  return null;
}

function textOf(event: any): string {
  const parts = (event.content ?? []).filter((item: any) => item.type === "text");
  return parts.map((item: any) => item.text).join("\n");
}

function looksLikeDenial(event: any): boolean {
  if (!event.isError) return false;
  const haystack = [event.toolName ?? "", textOf(event), JSON.stringify(event.details ?? {})].join("\n");
  return DENIAL_PATTERNS.some((pattern) => pattern.test(haystack));
}

function candidatePaths(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split("\n")) {
    if (!DENIAL_PATTERNS.some((pattern) => pattern.test(line))) continue;
    for (const match of line.matchAll(/\/[^\s"':,)\]}]+/g)) {
      const path = match[0].replace(/[.,;]+$/, "");
      if (path.length > 4) found.add(path);
    }
  }
  return [...found].slice(0, 5);
}

function whySelf(path: string, op: string): Hit | null {
  const bin = nonoBinary();
  if (!bin) return null;
  let out = "";
  try {
    out = execFileSync(bin, ["why", "--self", "--path", path, "--op", op], {
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error: any) {
    out = String(error?.stdout ?? "");
  }
  const verdict = /^\s*(ALLOWED|DENIED)/m.exec(out)?.[1];
  if (verdict !== "DENIED") return null;
  return {
    path,
    op,
    reason: /Reason:\s*(.+)/.exec(out)?.[1]?.trim() ?? "denied",
    fix: /Suggested fix:\s*(.+)/.exec(out)?.[1]?.trim() ?? "",
  };
}

function record(hits: Hit[]) {
  for (const hit of hits) {
    if (ledger.some((entry) => entry.path === hit.path && entry.op === hit.op)) continue;
    ledger.push(hit);
  }
}

function portable(path: string): string {
  return path.startsWith(HOME + "/") ? "$HOME" + path.slice(HOME.length) : path;
}

function grantArray(hit: Hit): string {
  if (hit.fix.includes("--read-file")) return "read_file";
  if (hit.fix.includes("--read")) return "read";
  if (hit.fix.includes("--allow")) return "allow";
  if (hit.op === "write") return "allow";
  return "read";
}

function summary(): string {
  if (ledger.length === 0) return "nono: no denials recorded this session.";
  const lines: string[] = ["nono: " + ledger.length + " denial(s) this session", ""];
  for (const hit of ledger) {
    lines.push("  " + portable(hit.path) + "  (" + hit.op + ")  " + hit.reason);
    lines.push("    { \"" + grantArray(hit) + "\": [\"" + portable(hit.path) + "\"] }");
  }
  lines.push("");
  lines.push("Merge those into filesystem in " + portable(GRANTS_FILE) + ",");
  lines.push("or re-run the failing command through: pi-nono-learn --apply -- <command>");
  lines.push("A path reported as permanently restricted also needs filesystem.bypass_protection.");
  return lines.join("\n");
}

export default function (pi: any) {
  pi.on("session_start", async (_event: any, ctx: any) => {
    if (insideNono() && ctx?.hasUI) ctx.ui.setStatus("nono", "nono sandbox");
  });

  pi.on("before_agent_start", async (event: any) => {
    if (!insideNono()) return undefined;
    return { systemPrompt: event.systemPrompt + "\n\n" + STANDING };
  });

  pi.on("tool_result", async (event: any, ctx: any) => {
    if (!insideNono() || !looksLikeDenial(event)) return undefined;

    const hits: Hit[] = [];
    for (const path of candidatePaths(textOf(event))) {
      const read = whySelf(path, "read");
      if (read) hits.push(read);
      const write = whySelf(path, "write");
      if (write) hits.push(write);
    }
    record(hits);

    if (ctx?.hasUI) ctx.ui.notify("nono sandbox denial detected", "warning");

    const confirmed = hits.length
      ? hits.map((hit) => "  " + portable(hit.path) + " (" + hit.op + ") " + hit.reason).join("\n")
      : "  (nono why --self did not confirm a path here)";

    return {
      content: [
        ...event.content,
        { type: "text", text: IMMEDIATE + "\n\nConfirmed by nono why --self:\n" + confirmed },
      ],
      isError: true,
    };
  });

  pi.on("agent_settled", async (_event: any, ctx: any) => {
    if (!insideNono() || ledger.length <= announced) return;
    announced = ledger.length;
    if (ctx?.hasUI) ctx.ui.notify("nono: " + ledger.length + " denial(s) this session - /nono-denials", "info");
  });

  pi.registerCommand("nono-denials", {
    description: "List what the nono sandbox refused this session, with the grant each one needs",
    handler: async (_args: string, ctx: any) => {
      if (!insideNono()) {
        ctx.ui.notify("Pi is not running inside a nono session.", "info");
        return;
      }
      ctx.ui.notify(summary(), "info");
    },
  });
}
