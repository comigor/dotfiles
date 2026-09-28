import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "jev-omp-"));
let score = 0.99;
mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
  model: "test-jev", answers: { is_dangerous: { noul: score } },
}), { status: 200 }));
const savedHome = process.env.HOME;
process.env.HOME = home;
const cwd = join(home, "workspace");
const outside = join(home, "outside");
mkdirSync(cwd);
mkdirSync(outside);
symlinkSync(outside, join(cwd, "escape"));
symlinkSync(join(home, "missing"), join(cwd, "dangling"));
let extension;
before(async () => { extension = (await import("../extensions/jev-guard.ts")).default; });
after(() => {
  process.env.HOME = savedHome;
  mock.restoreAll();
  rmSync(home, { recursive: true, force: true });
});

function host({ hasUI = false, select, signal } = {}) {
  const handlers = new Map();
  const entries = [];
  let keyRequests = 0;
  const ctx = {
    cwd, hasUI, signal, isProjectTrusted: () => false,
    sessionManager: { getBranch: () => [], getEntries: () => [] },
    modelRegistry: { getApiKeyForProvider: async () => { keyRequests++; return "test-only-key"; } },
    ui: { setStatus() {}, notify() {}, select },
  };
  extension({
    on: (name, handler) => handlers.set(name, handler),
    registerCommand() {}, registerMessageRenderer() {},
    events: { emit() {} },
    appendEntry: (_type, data) => entries.push(data),
  });
  return { entries, keyRequests: () => keyRequests,
    call: (toolName, input) => handlers.get("tool_call")({ toolName, input }, ctx),
  };
}

const patch = (path) => `[${path}#AB12]\nPUT 1.=1:\n+new value`;

describe("OMP file tool boundaries", () => {
  it("allows all ordinary hashline sections locally, including quoted moves", async () => {
    const h = host();
    assert.equal(await h.call("edit", { input: `${patch("one.go")}\n${patch("two.go")}\nMV "renamed file.go"` }), undefined);
    assert.equal(h.keyRequests(), 0);
  });

  it("reviews a later outside target instead of approving only the first section", async () => {
    const h = host();
    const result = await h.call("edit", { input: `${patch("one.go")}\n${patch("../outside/two.go")}` });
    assert.equal(result.block, true);
    assert.equal(h.keyRequests(), 1);
  });

  it("reviews a move destination even when its source is local", async () => {
    const h = host();
    assert.equal((await h.call("edit", { input: `${patch("one.go")}\nMV ../outside/moved.go` })).block, true);
    assert.equal(h.keyRequests(), 1);
  });

  it("reviews symlink escapes and canonical parent traversal", async () => {
    for (const path of ["escape/new.go", "sub/../../outside/new.go"]) {
      const h = host();
      assert.equal((await h.call("write", { path, content: "data" })).block, true);
      assert.equal(h.keyRequests(), 1);
    }
  });

  it("refuses unresolved dangling symlinks", async () => {
    await assert.rejects(host().call("write", { path: "dangling", content: "data" }), /Cannot resolve symlink/);
  });

  it("does not gate client questions, searches, or wiki dispatch", async () => {
    const h = host();
    for (const toolName of ["ask", "grep", "read", "wiki_observe"]) {
      assert.equal(await h.call(toolName, { path: outside, pattern: "admin|grant" }), undefined);
    }
    assert.equal(await h.call("write", { path: "xd://wiki_observe", content: "{}" }), undefined);
    assert.equal(h.keyRequests(), 0);
    assert.equal((await h.call("write", { path: "xd://github", content: "{}" })).block, true);
    assert.equal(h.keyRequests(), 1);
  });

  it("rejects unrecognized edit input instead of authorizing an unknown target", async () => {
    const h = host();
    assert.equal((await h.call("edit", { input: "not a patch" })).block, true);
  });
});

describe("OMP approval decisions", () => {
  it("honors both answers to a middle-band approval", async () => {
    score = 0.5;
    try {
      for (const [answer, blocked] of [["Yes, run it", false], ["No, block it", true]]) {
        const h = host({ hasUI: true, select: async () => answer });
        const result = await h.call("bash", { command: "git reset --hard HEAD" });
        assert.equal(result?.block === true, blocked);
      }
    } finally {
      score = 0.99;
    }
  });

  it("does not authorize an action after cancelling its pending approval", async () => {
    score = 0.5;
    const controller = new AbortController();
    try {
      const h = host({
        hasUI: true,
        signal: controller.signal,
        select: (_title, _choices, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          controller.abort(new Error("approval cancelled"));
        }),
      });
      await assert.rejects(h.call("bash", { command: "git reset --hard HEAD" }), /approval cancelled/);
    } finally {
      score = 0.99;
    }
  });
});
