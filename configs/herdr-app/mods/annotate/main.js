// Annotate: select text in an agent's terminal, press the bound key (annotate.note),
// and a composer opens over the quoted selection. Notes accumulate in a queue keyed
// by the terminal, so you can gather several across selections and deliver them all
// as one message — a steering message when the agent is working, a new prompt when
// it is idle. The queue survives closing the popup; Send all delivers and clears it.
//
// Mods cannot read a terminal selection directly, so grabbing borrows the clipboard:
// set a sentinel, run terminal.copy (a no-op with no selection), read the clipboard
// back, then restore what was there.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { focused, run, exec, notify, openOverlay, props, closeOverlay, theme, nextCommand, shared, setShared } from "herdr";

const PREVIEW_MAX = 200;
const queueKey = (terminal) => "annotate:queue:" + terminal;

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const pbpaste = async () => {
  const r = await exec("pbpaste", []).catch(() => ({ stdout: "" }));
  return r.stdout ?? "";
};
const pbcopy = async (text) => {
  await exec("/bin/sh", ["-c", "printf %s " + shq(text) + " | /usr/bin/pbcopy"]).catch(() => {});
};
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const preview = (s) => {
  const t = oneLine(s);
  return t.length > PREVIEW_MAX ? t.slice(0, PREVIEW_MAX) + "…" : t;
};

export default class Annotate extends View {
  init(_props, cx) {
    this.cx = cx;
    const p = props() ?? {};
    if (p.overlay) {
      // Popup copy: the composer over the queued notes.
      this.terminal = p.terminal;
      this.selected = oneLine(p.sel ?? "");
      this.queue = (Array.isArray(p.queue) ? p.queue : [])
        .map((q) => ({ sel: oneLine(q?.sel), note: String(q?.note ?? "") }));
      this.state = TextareaState.new({ placeholder: "Your note…", rows: 3 });
      this.state.set_auto_grow(3, 8);
      this.state.on("submit", (e) => { if (e?.secondary) this.add(); });
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
      width: 600,
      at: "top",
      offset: 64,
      props: { sel: selected, terminal: f.terminal, queue: shared(queueKey(f.terminal)) ?? [] },
    });
  }

  persist() {
    setShared(queueKey(this.terminal), this.queue);
    this.cx.notify();
  }

  add() {
    const note = (this.state?.value() ?? "").trim();
    if (!note) return;
    this.queue.push({ sel: this.selected, note });
    this.state.set_value("");
    this.state.focus();
    this.persist();
  }

  removeAt(i) {
    this.queue.splice(i, 1);
    this.persist();
  }

  clearQueue() {
    this.queue = [];
    this.persist();
  }

  sendAll() {
    if (!this.terminal) return;
    const pending = (this.state?.value() ?? "").trim();
    if (pending) { this.queue.push({ sel: this.selected, note: pending }); this.state.set_value(""); }
    if (!this.queue.length) return;
    const lines = this.queue.map((q, i) => (i + 1) + ') re: "' + preview(q.sel) + '" — ' + q.note);
    const message = "[Notes on your answer]\n" + lines.join("\n");
    const count = this.queue.length;
    exec("hc", ["send", this.terminal, message])
      .then(() => {
        setShared(queueKey(this.terminal), []);
        closeOverlay(props().overlay);
        notify({
          title: count + (count === 1 ? " note sent" : " notes sent"),
          body: "Delivered to " + this.terminal,
          level: "success",
          timeout: 2500,
          action: { name: "agent.focus", args: { terminal: this.terminal } },
        });
      })
      .catch((e) => {
        notify({ title: "Annotate failed", body: String(e).slice(0, 120), level: "error", timeout: 3500 });
      });
  }

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); return; }
    if (e.key === "enter" && (m.platform || m.control) && m.shift) { this.sendAll(); cx.stop_propagation(); return; }
    if (e.key === "enter" && (m.platform || m.control)) { this.add(); cx.stop_propagation(); }
  }

  render() {
    if (!props()?.overlay) return div().id("annotate").size_full();
    const t = theme();
    const button = (id, text, primary, action, dim) => h_flex().id(id).h(30).px(12).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : dim ? t.dim : t.foreground).text_size(12).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    const rows = this.queue.map((q, i) => h_flex().id("an-row-" + i).w_full().items_start().gap(8).p(8).rounded(8)
      .bg(t.surface).border_1().border_color(t.border)
      .child(div().flex_1().min_w_0()
        .child(div().text_size(11.5).text_color(t.muted).child((i + 1) + ') re: "' + preview(q.sel) + '"'))
        .child(div().text_size(12).text_color(t.foreground).child(q.note)))
      .child(h_flex().id("an-rm-" + i).px(6).py(2).rounded(6).text_size(12).text_color(t.dim).cursor_pointer()
        .hover(s => s.text_color(t.destructive ?? t.foreground)).on_click(() => this.removeAt(i)).child("✕")));
    return v_flex().id("annotate-popup").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).max_h(420).p(16).gap(8).bg(t.popover).rounded(10)
      .border_1().border_color(t.border).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(14).font_semibold().child("Notes to the agent"))
        .child(div().text_size(11).text_color(t.dim).child("⌘⏎ add · ⌘⇧⏎ send · Esc close")))
      .when(Boolean(this.selected), el => el.child(div().p(10).rounded(8).bg(t.surface).border_1().border_color(t.border)
        .text_size(11.5).text_color(t.muted).max_h(60).overflow_hidden().child('"' + this.selected + '"')))
      .when(this.queue.length > 0, el => el.child(v_flex().gap(6).w_full().min_h(0).children(rows)))
      .child(Textarea.new(this.state).w_full().px(10).py(8).rounded(9).border_1()
        .border_color(t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().gap(8).justify_end()
        .child(button("an-clear", "Clear all", false, () => this.clearQueue(), true))
        .child(button("an-close", "Close", false, () => closeOverlay(props().overlay)))
        .child(button("an-send", "Send" + (this.queue.length || (this.state?.value() ?? "").trim() ? " " + (this.queue.length + ((this.state?.value() ?? "").trim() ? 1 : 0)) : ""), this.queue.length > 0 || Boolean((this.state?.value() ?? "").trim()), () => this.sendAll())));
  }
}
