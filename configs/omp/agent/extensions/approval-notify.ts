import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

function esc(s: string): string {
  return s
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", " · ")
    .slice(0, 200);
}

function notify(title: string, body: string): void {
  if (process.platform !== "darwin") return;
  execFile(
    "osascript",
    ["-e", `display notification "${esc(body)}" with title "${esc(title)}" sound name "Glass"`],
    () => {},
  );
}

export default function approvalNotify(pi: ExtensionAPI): void {
  pi.on("tool_approval_requested", (event) => {
    const e = event as unknown as Record<string, unknown>;
    notify(
      "omp: approval requested",
      [e.toolName, e.reason, e.summary, JSON.stringify(e.input ?? "")].filter(Boolean).join(" · "),
    );
  });
}
