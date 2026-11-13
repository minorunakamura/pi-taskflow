import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ReviewResult } from "./plannotator.ts";

const exec = promisify(execFile);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

type Location = { space: string; tab: string; terminal: string; pane: string };
type Tab = {
  space: string;
  tab: string;
  local: boolean;
  terminals: { terminal: string; pane: string }[];
};

// Control calls are bounded; repeated wait check-ins never time out the human review.
async function command(
  program: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) {
  const { stdout } = await exec(program, args, {
    cwd,
    signal,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}
async function json(
  program: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await command(program, args, cwd, signal));
  if (!record(value)) throw new Error(`Invalid ${program} JSON response.`);
  return value;
}
async function tabs(cwd: string, signal?: AbortSignal): Promise<Tab[]> {
  const value = await json("herdr-app", ["ls"], cwd, signal);
  if (!Array.isArray(value.spaces))
    throw new Error("Invalid herdr-app spaces.");
  return value.spaces.flatMap((space: unknown) => {
    if (
      !record(space) ||
      !id(space.id) ||
      !Array.isArray(space.tabs) ||
      !(space.machine === null || typeof space.machine === "string")
    )
      throw new Error("Invalid herdr-app space.");
    const spaceId = space.id;
    return space.tabs.map((tab: unknown) => {
      if (!record(tab) || !id(tab.id) || !Array.isArray(tab.terminals))
        throw new Error("Invalid herdr-app tab.");
      const terminals = tab.terminals.map((terminal: unknown) => {
        if (!record(terminal) || !id(terminal.terminal) || !id(terminal.pane))
          throw new Error("Invalid herdr-app Terminal.");
        return { terminal: terminal.terminal, pane: terminal.pane };
      });
      return {
        space: spaceId,
        tab: tab.id,
        local: space.machine === null,
        terminals,
      };
    });
  });
}
function locate(list: Tab[], terminal: string): Location {
  const matches = list.flatMap((tab) =>
    tab.terminals
      .filter((t) => t.terminal === terminal)
      .map((t) => ({
        space: tab.space,
        tab: tab.tab,
        local: tab.local,
        pane: t.pane,
      })),
  );
  if (matches.length !== 1 || !matches[0].local)
    throw new Error(
      "Cannot uniquely identify a local calling Terminal in herdr-app (no active-tab fallback).",
    );
  const match = matches[0];
  return { space: match.space, tab: match.tab, terminal, pane: match.pane };
}
async function app(action: string, args: Record<string, unknown>, cwd: string) {
  const response = await json(
    "herdr-app",
    ["do", action, JSON.stringify(args)],
    cwd,
  );
  if (response.ok !== true) throw new Error(`herdr-app ${action} failed.`);
}
function checkAbort(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

/** Only this invocation's stdout is feedback; export and process exit are not approval. */
export async function reviewTuicr(
  ctx: Pick<ExtensionContext, "cwd" | "hasUI"> & {
    ui: Pick<ExtensionContext["ui"], "select" | "notify">;
  },
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const cwd = resolve(ctx.cwd);
  let origin: Location | undefined;
  let owned: { space: string; tab: string; terminal: string } | undefined;
  let directory: string | undefined;
  let launchAttempted = false;
  let result: ReviewResult = { status: "error", approved: false };
  let feedback: string | undefined;
  const cleanupErrors: string[] = [];
  try {
    checkAbort(signal);
    if (!ctx.hasUI)
      return {
        status: "unavailable",
        approved: false,
        error: "tuicr requires Pi dialog UI (TUI or RPC).",
      };
    if (process.platform === "win32")
      return {
        status: "unavailable",
        approved: false,
        error: "tuicr requires a local POSIX environment.",
      };
    const terminal = process.env.HC_TERMINAL_ID;
    if (!terminal)
      return {
        status: "unavailable",
        approved: false,
        error:
          "HC_TERMINAL_ID is required to identify the calling Pi Terminal.",
      };
    await Promise.all(
      ["herdr-app", "hc", "tuicr"].map((program) =>
        command(program, ["--version"], cwd, signal),
      ),
    );
    const git = await command(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      cwd,
      signal,
    );
    if (git.trim() !== "true")
      throw new Error("tuicr requires a Git working tree cwd.");
    const existingTabs = await tabs(cwd, signal);
    origin = locate(existingTabs, terminal);
    checkAbort(signal);
    directory = await mkdtemp(join(tmpdir(), "taskflow-tuicr-"));
    const output = join(directory, "stdout.md");
    const diagnostics = join(directory, "stderr.txt");
    checkAbort(signal);
    ctx.ui.notify(
      "tuicr: review the working tree. Press y or type :clip then Enter to export and exit; no extra q is needed. Without exporting, use :q then Enter (refuses unsaved comments); q alone does not quit. Return to Pi for Approve / Reject / Cancel. Export and exit are not approval.",
      "info",
    );
    launchAttempted = true;
    // Do not abort tab.new: collect a late ownership response before limited cleanup.
    const launched = await json(
      "herdr-app",
      [
        "do",
        "tab.new",
        JSON.stringify({
          space: origin.space,
          folder: cwd,
          name: "Taskflow Code Review (tuicr)",
          // exec replaces herdr-app's login shell; otherwise exit can recover into a live shell.
          argv: [
            "exec",
            "/bin/sh",
            "-c",
            'printf "%s\\n" "Taskflow: y or :clip Enter exports and exits; no extra q. Without export: :q Enter (refuses unsaved comments); q alone does not quit. Decide Approve / Reject / Cancel in Pi."; exec tuicr -w --stdout >"$1" 2>"$2"',
            "taskflow-tuicr",
            output,
            diagnostics,
          ],
        }),
      ],
      cwd,
    );
    if (
      !id(launched.space) ||
      !id(launched.tab) ||
      !id(launched.terminal) ||
      launched.space !== origin.space ||
      existingTabs.some(
        (tab) =>
          tab.tab === launched.tab ||
          tab.terminals.some((t) => t.terminal === launched.terminal),
      )
    )
      throw new Error(
        "Invalid tab.new ownership response; a review tab may remain. No name-based cleanup attempted.",
      );
    const candidate = {
      space: launched.space,
      tab: launched.tab,
      terminal: launched.terminal,
    };
    const list = await tabs(cwd);
    const match = list.find(
      (tab) => tab.space === candidate.space && tab.tab === candidate.tab,
    );
    if (
      match &&
      (!match.local ||
        !match.terminals.some((t) => t.terminal === candidate.terminal))
    )
      throw new Error("Review tab ownership does not match herdr-app ls.");
    owned = candidate;
    checkAbort(signal);
    if (match) {
      await app("space.select", { id: owned.space }, cwd);
      await app("tab.select", { id: owned.tab }, cwd);
      await app("pane.focus", { terminal: owned.terminal }, cwd);
    }
    for (;;) {
      checkAbort(signal);
      // oxlint-disable-next-line no-await-in-loop -- Poll one exact Terminal until its human review ends.
      const waited = await json(
        "hc",
        ["wait", owned.terminal, "--timeout", "5", "--json"],
        cwd,
        signal,
      );
      checkAbort(signal);
      if (
        waited.terminal !== owned.terminal ||
        typeof waited.ended !== "boolean" ||
        typeof waited.reason !== "string"
      )
        throw new Error("Invalid hc wait response.");
      if (waited.reason === "timeout" || waited.reason === "message") continue;
      if (
        !waited.ended ||
        waited.reason !== "exit" ||
        waited.exit_code !== 0 ||
        waited.signal !== null
      )
        throw new Error("tuicr did not exit normally (hc wait).");
      // oxlint-disable-next-line no-await-in-loop -- Validate the exit reported by this wait before proceeding.
      const ended = await json(
        "hc",
        ["get", owned.terminal, "--json"],
        cwd,
        signal,
      );
      if (
        ended.address !== owned.terminal ||
        ended.state !== "finished" ||
        ended.reason !== "exited" ||
        ended.exit_code !== 0 ||
        ended.signal !== null
      )
        throw new Error(
          "tuicr did not exit normally (killed, lost or recovered shell).",
        );
      break;
    }
    feedback = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(output),
    );
    checkAbort(signal);
    result = { status: "cancelled", approved: false, feedback };
  } catch (error) {
    result = {
      status: signal?.aborted ? "cancelled" : "error",
      approved: false,
      ...(feedback !== undefined && { feedback }),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (owned) {
      const resource = owned;
      const attempt = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
        } catch (error) {
          cleanupErrors.push(String(error));
        }
      };
      await attempt(async () => {
        const list = await tabs(cwd);
        const tab = list.find(
          (t) => t.space === resource.space && t.tab === resource.tab,
        );
        if (tab) {
          if (
            !tab.local ||
            !tab.terminals.some((t) => t.terminal === resource.terminal)
          )
            throw new Error("Review tab ownership changed; tab not closed.");
          if (tab.terminals.length === 1)
            await app("tab.close", { id: resource.tab, confirmed: true }, cwd);
        }
      });
      await attempt(async () => {
        try {
          const terminal = await json(
            "hc",
            ["get", resource.terminal, "--json"],
            cwd,
          );
          if (terminal.address !== resource.terminal)
            throw new Error("Invalid cleanup Terminal identity.");
          if (terminal.state !== "finished") {
            const killed = await json(
              "hc",
              ["kill", resource.terminal, "--json"],
              cwd,
            );
            if (killed.address !== resource.terminal)
              throw new Error("Invalid hc kill response.");
            const waited = await json(
              "hc",
              ["wait", resource.terminal, "--timeout", "5", "--json"],
              cwd,
            );
            if (
              waited.terminal !== resource.terminal ||
              waited.ended !== true ||
              waited.reason !== "exit"
            )
              throw new Error(
                "Cleanup Terminal did not finish within the bounded wait.",
              );
            const ended = await json(
              "hc",
              ["get", resource.terminal, "--json"],
              cwd,
            );
            if (
              ended.address !== resource.terminal ||
              ended.state !== "finished"
            )
              throw new Error("Cleanup Terminal is not finished.");
          }
          const removed = await json(
            "hc",
            ["rm", resource.terminal, "--json"],
            cwd,
          );
          if (removed.removed !== resource.terminal)
            throw new Error("Invalid hc rm response.");
        } catch (error) {
          // hc reports an already-removed exact ID with its structured not_found error.
          if (
            !record(error) ||
            error.code !== 3 ||
            typeof error.stderr !== "string"
          )
            throw error;
          const response: unknown = JSON.parse(error.stderr);
          if (
            !record(response) ||
            !record(response.error) ||
            response.error.kind !== "not_found"
          )
            throw error;
        }
      });
    } else if (launchAttempted) {
      cleanupErrors.push(
        "Launch ownership response unavailable; a review tab/Terminal may remain. Inspect manually; no guessed cleanup performed.",
      );
    }
    if (origin && launchAttempted) {
      try {
        const current = locate(await tabs(cwd), origin.terminal);
        if (
          current.space !== origin.space ||
          current.tab !== origin.tab ||
          current.pane !== origin.pane
        )
          cleanupErrors.push(
            "Calling Pi location changed; return not attempted.",
          );
        else {
          await app("space.select", { id: origin.space }, cwd);
          await app("tab.select", { id: origin.tab }, cwd);
          await app("pane.focus", { terminal: origin.terminal }, cwd);
        }
      } catch (error) {
        cleanupErrors.push(`Pi return failed: ${String(error)}`);
      }
    }
    if (directory) {
      try {
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(
          `Temporary output remains at ${directory}: ${String(error)}`,
        );
      }
    }
  }
  if (cleanupErrors.length)
    return {
      status: signal?.aborted ? "cancelled" : "error",
      approved: false,
      ...(feedback !== undefined && { feedback }),
      error: [
        result.error,
        `Cleanup/return failed${owned ? ` (space ${owned.space}, tab ${owned.tab}, Terminal ${owned.terminal})` : ""}:`,
        ...cleanupErrors,
      ]
        .filter(Boolean)
        .join(" "),
    };
  if (result.status === "error" || signal?.aborted)
    return signal?.aborted
      ? { ...result, status: "cancelled", approved: false }
      : result;
  try {
    const choice = await ctx.ui.select(
      feedback
        ? "tuicr export received (Markdown returned as feedback, not approval). Decide Code Review:"
        : "No exported comments received from tuicr (this does not mean no findings). Decide Code Review:",
      ["Approve", "Reject", "Cancel"],
      { signal },
    );
    checkAbort(signal);
    return {
      status:
        choice === "Approve"
          ? "approved"
          : choice === "Reject"
            ? "rejected"
            : "cancelled",
      approved: choice === "Approve",
      feedback,
    };
  } catch (error) {
    return {
      status: signal?.aborted ? "cancelled" : "error",
      approved: false,
      feedback,
      error: String(error),
    };
  }
}
