// Continuable side conversations for OMP.
//
// Adds two slash commands:
//   /side <question>   Branch the current conversation into a new side session
//                       seeded from the current context, record the parent
//                       session so we can return to it, then start the turn.
//   /side-back          Switch back to the recorded parent session. The side
//                       session stays resumable via /resume.
//
// The side session is a real, persisted, resumable OMP session: it has the
// full agent + tools, and its messages never enter the parent's context.
// This is the closest the single-active-session model gets to a "continuable
// side conversation" without forking OMP core. Built-in /btw is untouched.
//
// Discovered automatically as a native user extension from
// ~/.omp/agent/extensions/side.ts (symlinked from this file by chezmoi).
// Requires no config.yml change.

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/**
 * Custom (non-LLM) entry recording the parent session file we should return
 * to. Persisted into the side session's transcript so /side-back survives
 * restarts and /resume.
 */
const PARENT_ENTRY_TYPE = "side:parent";

/**
 * Custom (non-LLM) entry recording that a session was started as a side
 * conversation. Lets us render the /side-back hint on resume.
 */
const SIDE_MARKER_TYPE = "side:marker";

interface ParentEntryData {
	/** Absolute path of the parent (main) session JSONL file. */
	parentSessionFile: string;
}

function isUserMessageEntry(entry: { type: string }): entry is {
	type: "message";
	message: { role: string };
} {
	return (
		entry.type === "message" &&
		(entry as { message?: { role?: string } }).message?.role === "user"
	);
}

/**
 * Find the most recent user-message entry on the active branch.
 * `branch(entryId)` requires a user message; the current leaf may not be one.
 * Returns the entry id, or undefined when the conversation has no user turn.
 */
function latestUserMessageEntryId(branch: ReadonlyArray<{ id: string; type: string }>): string | undefined {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (isUserMessageEntry(entry)) return entry.id;
	}
	return undefined;
}

/**
 * Scan the active branch for our recorded parent pointer (last one wins).
 * Restores the return-to-main link after a restart or /resume of a side
 * session.
 */
function findParentSessionFile(
	branch: ReadonlyArray<{ type: string; customType?: string; data?: unknown }>,
): string | undefined {
	let parent: string | undefined;
	for (const entry of branch) {
		if (entry.type === "custom" && entry.customType === PARENT_ENTRY_TYPE) {
			const data = entry.data as ParentEntryData | undefined;
			if (data?.parentSessionFile) parent = data.parentSessionFile;
		}
	}
	return parent;
}

function isSideSession(
	branch: ReadonlyArray<{ type: string; customType?: string }>,
): boolean {
	return branch.some(
		entry => entry.type === "custom" && entry.customType === SIDE_MARKER_TYPE,
	);
}

export default function sideConversation(pi: ExtensionAPI): void {
	pi.setLabel("Side conversation");

	// /side <question>
	// Branch from the current leaf into a side session, record the parent
	// pointer, and start the turn with the question.
	pi.registerCommand("side", {
		description: "Open a continuable side conversation branched from the current context",
		handler: async (args: string, ctx) => {
			const question = args.trim();
			if (!question) {
				ctx.ui.notify("Usage: /side <question>", "error");
				return;
			}

			// session-control actions are only safe once the agent is idle.
			await ctx.waitForIdle();

			const mainFile = ctx.sessionManager.getSessionFile();
			const leafId = ctx.sessionManager.getLeafId();
			if (!mainFile) {
				ctx.ui.notify("Cannot /side: current session is not persisted", "error");
				return;
			}

			// If we're already inside a side session, branch relative to the
			// original parent so we don't nest side sessions one level deeper
			// each time. The parent pointer for the new session is the
			// earliest recorded ancestor (the true main session).
			const branchEntries = ctx.sessionManager.getBranch();
			const inheritedParent = findParentSessionFile(branchEntries);
			const parentToRecord = inheritedParent ?? mainFile;

			let cancelled = false;
			const userEntryId =
				leafId && latestUserMessageEntryId(branchEntries);

			if (userEntryId) {
				// Branch from the latest user message: seeds the side session
				// with the current conversation context.
				const result = await ctx.branch(userEntryId);
				cancelled = result.cancelled;
			} else {
				// No user turn to branch from yet: start an empty session and
				// link it to the parent. ctx.newSession creates an empty
				// session with only a lineage header (no context copy).
				const result = await ctx.newSession({ parentSession: parentToRecord });
				cancelled = result.cancelled;
			}

			if (cancelled) {
				ctx.ui.notify("/side cancelled", "info");
				return;
			}

			// Persist return-to-main pointer + a marker that this is a side
			// session into the new session's transcript. appendEntry writes a
			// non-LLM custom entry, so it never pollutes context.
			pi.appendEntry(PARENT_ENTRY_TYPE, { parentSessionFile: parentToRecord } satisfies ParentEntryData);
			// Start the side turn with the user's question. sendUserMessage
			// begins a normal agent turn when idle (full tools enabled).
			pi.sendUserMessage(question);

			ctx.ui.notify("Side conversation started — use /side-back to return to main", "info");
		},
	});

	// /side-back
	// Switch back to the recorded parent session. The side session remains a
	// normal resumable session file.
	pi.registerCommand("side-back", {
		description: "Return to the parent session from a /side conversation",
		handler: async (_args: string, ctx) => {
			await ctx.waitForIdle();

			const branchEntries = ctx.sessionManager.getBranch();
			const parentFile = findParentSessionFile(branchEntries);
			if (!parentFile) {
				ctx.ui.notify(
					"No parent session recorded here — /side-back only works inside a /side conversation",
					"error",
				);
				return;
			}

			const result = await ctx.switchSession(parentFile);
			if (result.cancelled) {
				ctx.ui.notify("/side-back cancelled", "info");
				return;
			}
			ctx.ui.notify("Returned to main session", "info");
		},
	});

	// On (re)entering a session, surface a hint if it's a side session, so the
	// user knows /side-back is available after a restart or /resume.
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		const branchEntries = ctx.sessionManager.getBranch();
		if (isSideSession(branchEntries)) {
			ctx.ui.notify("Inside a /side conversation — /side-back to return to main", "info");
		}
	});
}
