// desktop-notifications: Herdr's "needs you" and "finished" alerts in the
// system's notification center too (macOS, Linux). Draws nothing: dock it in a
// 0px block. alerts.js decides what to announce; this file delivers it.

import { View, div } from "gpui-kit";
import { agents, terminals, focused, window, exec, props } from "herdr";
import { diff } from "./alerts.js";

const BUNDLE = "dev.herdr.app";
const GROUP = "herdr-agent-";

// Quotes one word for sh.
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export default class DesktopNotifications extends View {
  init(_props, cx) {
    this.known = null;
    this.sender = null; // "terminal-notifier" | "osascript" | "notify-send" | "none", found on first use
    this.app = null; // herdr-app's path, for click-to-focus
    // render runs on every live change; the timer covers a hidden block.
    cx.timer.every(2000, () => this.check());
  }

  check() {
    let live;
    try {
      live = agents();
    } catch {
      return;
    }
    const p = props() ?? {};
    const subAgents = new Set((terminals() ?? []).filter((t) => t?.parent).map((t) => t.address));
    const { known, post, clear } = diff(this.known, live, {
      focus: focused(),
      windowActive: window()?.active ?? false,
      subAgents,
      want: { blocked: p.blocked, done: p.done },
    });
    this.known = known;
    if (post.length || clear.length) this.deliver(post, clear).catch((e) => console.log(`desktop-notifications: ${e}`));
  }

  async deliver(post, clear) {
    for (const n of post) await this.post(await this.findSender(), n);
    if (this.sender === "terminal-notifier") {
      for (const address of clear) await exec("terminal-notifier", ["-remove", GROUP + address]).catch(() => {});
    }
  }

  async findSender() {
    if (this.sender) return this.sender;
    const has = async (cmd) => (await exec("/bin/sh", ["-c", `command -v ${cmd}`]).catch(() => ({ code: 1, stdout: "" }))).code === 0;
    const platform = window()?.platform;
    if (platform === "macos") {
      this.sender = (await has("terminal-notifier")) ? "terminal-notifier" : "osascript";
      const found = await exec("/bin/sh", ["-c", "command -v herdr-app"]).catch(() => null);
      this.app = found?.code === 0 ? found.stdout.trim() : null;
    } else if (platform === "linux") {
      this.sender = (await has("notify-send")) ? "notify-send" : "none";
    } else {
      this.sender = "none";
    }
    return this.sender;
  }

  async post(sender, n) {
    if (sender === "terminal-notifier") {
      const args = ["-title", n.title, "-message", n.body, "-group", GROUP + n.address, "-activate", BUNDLE];
      if (n.subtitle) args.push("-subtitle", n.subtitle);
      if (this.app) args.push("-execute", `${sh(this.app)} do agent.focus ${sh(JSON.stringify({ terminal: n.address }))}`);
      const r = await exec("terminal-notifier", args).catch(() => ({ code: -1 }));
      if (r.code === 0) return;
      // Not allowed to notify (System Settings > Notifications), or broken: use macOS's
      // own for this one, and try terminal-notifier again next time (it may be allowed by then).
      return this.post("osascript", n);
    }
    if (sender === "osascript") {
      const script = "on run argv\ndisplay notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv)\nend run";
      await exec("osascript", ["-e", script, n.title, n.subtitle ?? "", n.body]);
    } else if (sender === "notify-send") {
      const body = n.subtitle ? `${n.subtitle}\n${n.body}` : n.body;
      await exec("notify-send", ["--app-name=Herdr", `--urgency=${n.alert === "blocked" ? "critical" : "normal"}`, n.title, body]);
    }
  }

  render() {
    this.check();
    return div().id("desktop-notifications").size_full();
  }
}
