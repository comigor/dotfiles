// panes: Ctrl+Tab and Ctrl+Shift+Tab cycle the focused tab's panes, wrapping around.
// It draws nothing; it exists so the keys have something to reach, because pane.go
// stops at the edge and the app has no cycle command of its own.
import { View, div } from "gpui-kit";
import { focused, nextCommand, panes, run } from "herdr";

export default class Panes extends View {
  init(_props, cx) {
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "next" || command === "prev") this.step(command);
      }
    });
  }

  step(direction) {
    const here = focused();
    if (!here) return;
    const siblings = panes().filter((p) => p.tab === here.tab && p.terminal);
    if (siblings.length < 2) return;
    const at = siblings.findIndex((p) => p.focused || (here.terminal && p.terminal === here.terminal));
    if (at < 0) return;
    const offset = direction === "prev" ? siblings.length - 1 : 1;
    run("pane.focus", { pane: siblings[(at + offset) % siblings.length].pane });
  }

  render() {
    return div().id("panes").size_full();
  }
}
