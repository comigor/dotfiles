// desktop-notifications: decides which agent changes to announce. Pure: no
// `herdr` import, so tests can feed it plain objects.
//
// It mirrors Herdr's own attention rule (the one behind its sounds and
// toasts): needing you always alerts; finishing alerts only when you weren't
// looking. Sub-agents report through their parent and never alert.

const BLOCKED = new Set(["blocked"]);
const BUSY = new Set(["working", "blocked"]);
const WAITING = new Set(["blocked", "done"]);

/** What a status change means: "blocked", "done", or null. */
export function alertFor(prev, next, looking) {
  if (BLOCKED.has(next) && !BLOCKED.has(prev)) return "blocked";
  if (BUSY.has(prev) && next && !BUSY.has(next) && !looking) return "done";
  return null;
}

/** Whether the person can see this agent now: the window is in front and the
 *  agent is in the tab it shows. */
export function isLooking(agent, focus, windowActive) {
  return Boolean(windowActive && focus && agent.space === focus.space && agent.tab === focus.tab);
}

/** The notification's text, in Herdr's own words. */
export function message(agent, alert) {
  const name = agent.program?.name || agent.app || "An agent";
  const title = alert === "blocked" ? `${name} needs you` : `${name} finished`;
  const tab = (agent.tab_name ?? "").trim();
  const space = (agent.space_name ?? "").trim();
  const subtitle = space && tab && space !== tab ? `${space} / ${tab}` : space || tab;
  return { title, subtitle, body: (agent.title ?? "").trim() || tab || name };
}

/**
 * Compares the last statuses with the live agents.
 * `known`: Map address -> { status, posted } from the previous call (null on the first).
 * Returns { known, post: [{ address, alert, ...message }], clear: [address] }.
 * The first call only records: nothing that happened before Herdr loaded the mod
 * is announced.
 */
export function diff(known, agents, { focus, windowActive, subAgents = new Set(), want = {} }) {
  const next = new Map();
  const post = [];
  const clear = [];
  for (const agent of agents) {
    if (subAgents.has(agent.address)) continue;
    const before = known?.get(agent.address);
    let posted = before?.posted ?? false;
    if (known && before && before.status !== agent.status) {
      const alert = alertFor(before.status, agent.status, isLooking(agent, focus, windowActive));
      if (alert && want[alert] !== false) {
        post.push({ address: agent.address, alert, ...message(agent, alert) });
        posted = true;
      } else if (posted && !WAITING.has(agent.status)) {
        clear.push(agent.address);
        posted = false;
      }
    }
    next.set(agent.address, { status: agent.status, posted });
  }
  for (const [address, entry] of known ?? []) {
    if (entry.posted && !next.has(address)) clear.push(address);
  }
  return { known: next, post, clear };
}
