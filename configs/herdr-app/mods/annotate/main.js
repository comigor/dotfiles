// Annotate: select text in an agent's terminal, press the bound key (annotate.note),
// type a note, and it lands in that agent's terminal as its next input — a steering
// message when it is working, a new prompt when it is idle.
//
// Mods cannot read a terminal selection directly, so the note flow borrows the
// clipboard: set a sentinel, run terminal.copy (a no-op with no selection), read
// the clipboard back, then restore what was there.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { focused, run, exec, notify, openOverlay, props, closeOverlay, theme } from "herdr";

const PREVIEW_MAX = 240;

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const pbpaste = async () => {
  const r = await exec("pbpaste", []).catch(() => ({ stdout: "" }));
  return r.stdout ?? "";
};
const pbcopy = async (text) => {
  await exec("/bin/sh", ["-c", "printf %s " + shq(text) + " | /usr/bin/pbcopy"]).catch(() => {});
};
const oneLine = (s) => s.replace(/\s+/g, " ").trim();
const preview = (s) => {
  const t = oneLine(s);
  return t.length > PREVIEW_MAX ? t.slice(0, PREVIEW_MAX) + "…" : t;
};

export default class Annotate extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.overlay) {
      // Popup copy: the note composer over the selected text.
      this.terminal = p.terminal;
      this.selected = oneLine(p.sel ?? "");
      this.state = TextareaState.new({ placeholder: "Your note for the agent…", rows: 3 });
      this.state.set_auto_grow(3, 8);
      this.state.on("submit", () => this.submit());
      this.state.on("change", () => cx.notify());
      this.handle = cx.focus_handle();
      cx.timer.after(50, () => this.state.focus());
      return;
    }
    // Docked copy: listens for the key command.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "note") await this.note();
      }
    });
  }

  async note() {
    const f = focused();
    if (!f?.terminal) {
      notify({ title: "Annotate", body: "Focus an agent terminal first", level: "error", timeout: 2500 });
      return;
    }
    const previous = await pbpaste();
    const sentinel = "annotate-sentinel-" + Math.random().toString(36).slice(2);
    await pbcopy(sentinel);
    await run("terminal.copy");
    const selected = await pbpaste();
    if (selected === sentinel || !selected.trim()) {
      await pbcopy(previous);
      notify({ title: "Annotate", body: "Select text in the terminal first", level: "error", timeout: 2500 });
      return;
    }
    await pbcopy(previous);
    openOverlay({
      mod: "annotate",
      kind: "popup",
      width: 560,
      at: "top",
      offset: 64,
      props: { sel: selected, terminal: f.terminal },
    });
  }

  submit() {
    const p = props() ?? {};
    const note = (this.state?.value() ?? "").trim();
    if (!note || !p.terminal) return;
    const message = '[Note] re: "' + preview(this.selected) + '" — ' + note;
    exec("hc", ["send", p.terminal, message])
      .then(() => {
        closeOverlay(p.overlay);
        notify({
          title: "Note sent",
          body: "Delivered to " + p.terminal,
          level: "success",
          timeout: 2000,
          action: { name: "agent.focus", args: { terminal: p.terminal } },
        });
      })
      .catch((e) => {
        notify({ title: "Annotate failed", body: String(e).slice(0, 120), level: "error", timeout: 3500 });
      });
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); return; }
    if (e.key === "enter" && (m.platform || m.control)) { this.submit(); cx.stop_propagation(); }
  }

  render() {
    if (!props()?.overlay) return div().id("annotate").size_full();
    const t = theme();
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("annotate-popup").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).p(16).gap(8).bg(t.popover).rounded(10)
      .border_1().border_color(t.border).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(14).font_semibold().child("Note to the agent"))
        .child(div().text_size(11).text_color(t.dim).child("⌘⏎ send · Esc cancel")))
      .child(div().p(10).rounded(8).bg(t.surface).border_1().border_color(t.border)
        .text_size(12).text_color(t.muted).max_h(72).overflow_hidden().child('"' + this.selected + '"'))
      .child(Textarea.new(this.state).w_full().px(10).py(8).rounded(9).border_1()
        .border_color(t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().gap(8).justify_end()
        .child(button("an-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
        .child(button("an-send", "Send", true, () => this.submit())));
  }
}
