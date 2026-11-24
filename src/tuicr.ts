import { join } from "node:path";
import type { ReviewResult } from "./plannotator.ts";
import { readText, reviewInHerdrTab, type TabContext } from "./herdr-tab.ts";

/** Only this invocation's stdout is feedback; export and process exit are not approval. */
export function reviewTuicr(
  ctx: TabContext,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  return reviewInHerdrTab(
    ctx,
    {
      program: "tuicr",
      git: true,
      tabName: "Taskflow Code Review (tuicr)",
      notice:
        "tuicr: review the working tree. Press y or type :clip then Enter to export and exit; no extra q is needed. Without exporting, use :q then Enter (refuses unsaved comments); q alone does not quit. Return to Pi for Approve / Reject / Cancel. Export and exit are not approval.",
      // exec replaces herdr-app's login shell; otherwise exit can recover into a live shell.
      script:
        'printf "%s\\n" "Taskflow: y or :clip Enter exports and exits; no extra q. Without export: :q Enter (refuses unsaved comments); q alone does not quit. Decide Approve / Reject / Cancel in Pi."; exec tuicr -w --stdout >"$1" 2>"$2"',
      args: (dir) => [join(dir, "stdout.md"), join(dir, "stderr.txt")],
      collect: async (dir) => ({
        feedback: await readText(join(dir, "stdout.md")),
      }),
      received:
        "tuicr export received (Markdown returned as feedback, not approval). Decide Code Review:",
      empty:
        "No exported comments received from tuicr (this does not mean no findings). Decide Code Review:",
    },
    signal,
  );
}
