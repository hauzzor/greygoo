import { tool } from "@opencode-ai/plugin";

const fallbackMessage = () =>
  `opencode: auto-commit ${new Date().toISOString()}`;

function autocommitDisabled() {
  const value = process.env.OPENCODE_AUTOCOMMIT;
  return value === "0" || value === "false" || value === "off";
}

export default async ({ directory, worktree, $ }) => {
  const baseRepo = worktree || directory;

  async function pendingChanges(repo) {
    const inside = (
      await $`git -C ${repo} rev-parse --is-inside-work-tree`.nothrow().quiet().text()
    ).trim();
    if (inside !== "true") return null;

    const status = (
      await $`git -C ${repo} status --porcelain`.nothrow().quiet().text()
    ).trim();
    return status;
  }

  async function commit(repo, message) {
    const status = await pendingChanges(repo);
    if (status === null) return { ok: false, reason: "not-a-repo" };
    if (!status) return { ok: false, reason: "clean" };

    const add = await $`git -C ${repo} add -A`.nothrow().quiet();
    if (add.exitCode !== 0) {
      return { ok: false, reason: "add-failed", detail: add.stderr.toString().trim() };
    }

    const result = await $`git -C ${repo} commit -m ${message}`.nothrow().quiet();
    if (result.exitCode !== 0) {
      return {
        ok: false,
        reason: "commit-failed",
        detail: result.stderr.toString().trim(),
      };
    }

    const log = (
      await $`git -C ${repo} log -1 --oneline`.nothrow().quiet().text()
    ).trim();
    const files = status.split("\n").filter(Boolean).length;
    return { ok: true, log, files };
  }

  return {
    tool: {
      commit_changes: tool({
        description:
          "Commit all pending changes in the Grey Goo git repository with a " +
          "model-authored message. Call this at the end of every logical task. " +
          "Commits locally only and never pushes.",
        args: {
          message: tool.schema
            .string()
            .describe("Concise commit message: what changed and why (one line)."),
        },
        async execute(args, context) {
          if (autocommitDisabled()) {
            return "Auto-commit is disabled (OPENCODE_AUTOCOMMIT).";
          }
          const repo = context.worktree || context.directory || baseRepo;
          const result = await commit(repo, args.message);
          if (result.ok) {
            return `Committed ${result.files} file(s): ${result.log}`;
          }
          if (result.reason === "clean") {
            return "Nothing to commit — working tree is clean.";
          }
          if (result.reason === "not-a-repo") {
            return "Not inside a git work tree; skipped.";
          }
          return `Commit failed (${result.reason}): ${result.detail}`;
        },
      }),
    },

    async dispose() {
      if (autocommitDisabled()) return;
      try {
        const result = await commit(baseRepo, fallbackMessage());
        if (result.ok) {
          console.log(`[auto-commit] fallback committed: ${result.log}`);
        }
      } catch (error) {
        console.log(`[auto-commit] fallback failed: ${String(error)}`);
      }
    },
  };
};
