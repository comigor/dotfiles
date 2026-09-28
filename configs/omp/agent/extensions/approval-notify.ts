import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { TERMINAL } from "@oh-my-pi/pi-tui";

function notify(title: string, body: string): void {
  TERMINAL.sendNotification({
    title,
    body: body.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, 200),
    type: "ask",
    urgency: "normal",
    actions: "focus",
  });
}

export default function approvalNotify(pi: ExtensionAPI): void {
  pi.on("tool_approval_requested", (event) => {
    notify(
      "omp: approval requested",
      [event.toolName, event.reason].filter(Boolean).join(" · "),
    );
  });
  pi.events.on("jev-guard:approval-requested", () => {
    notify(
      "omp: Jev approval requested",
      "A tool call is waiting for your decision in OMP.",
    );
  });
}
