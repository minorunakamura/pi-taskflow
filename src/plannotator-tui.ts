import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readText, reviewInHerdrTab, type TabContext } from "./herdr-tab.ts";
import type {
  PlanReviewInput,
  PlanReviewResult,
  ReviewResult,
} from "./plannotator.ts";

// Drop launcher targets so Send/Approve never type into an agent pane; feedback returns only to Taskflow.
const isolate =
  "unset HERDR_ENV HERDR_PANE_ID PLANNOTATOR_TUI_DELIVER_TO PLANNOTATOR_TUI_HC_TERMINAL PLANNOTATOR_TUI_HC_PID PLANNOTATOR_TUI_REX_BLOCK PLANNOTATOR_TUI_REX_PID;";

/** Parses the `--gate --result-file` record; only `approved` approves. */
export function gateDecision(text: string): PlanReviewResult {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !("decision" in value) ||
    ("feedback" in value && typeof value.feedback !== "string")
  )
    throw new Error("Invalid plannotator-tui result file.");
  const feedback =
    "feedback" in value && typeof value.feedback === "string"
      ? { feedback: value.feedback }
      : {};
  if (value.decision === "approved")
    return { status: "approved", approved: true, ...feedback };
  if (value.decision === "annotated")
    return { status: "rejected", approved: false, ...feedback };
  if (value.decision === "dismissed")
    return { status: "cancelled", approved: false };
  throw new Error("Invalid plannotator-tui decision.");
}

/** Plan Review with plannotator-tui's approval gate; the gate decision is the human's decision. */
export function reviewPlanTui(
  ctx: TabContext,
  input: PlanReviewInput,
  signal?: AbortSignal,
): Promise<PlanReviewResult> {
  if (
    typeof input.planContent !== "string" ||
    !input.planContent.trim() ||
    (input.planFilePath !== undefined &&
      (typeof input.planFilePath !== "string" || !input.planFilePath.trim()))
  )
    return Promise.resolve({
      status: "error",
      approved: false,
      error: "Expected non-empty planContent and, if provided, planFilePath.",
    });
  const plan = (dir: string) => join(dir, "plan.md");
  return reviewInHerdrTab(
    ctx,
    {
      program: "plannotator-tui",
      git: false,
      tabName: "Taskflow Plan Review (plannotator-tui)",
      notice:
        "plannotator-tui: review the Plan. A approves, E sends feedback (not approval), q dismisses. The window closes on any decision.",
      script: `${isolate} exec plannotator-tui "$1" --gate --json --result-file "$2" 2>"$3"`,
      args: (dir) => [
        plan(dir),
        join(dir, "result.json"),
        join(dir, "stderr.txt"),
      ],
      prepare: (dir) => writeFile(plan(dir), input.planContent, { flag: "wx" }),
      collect: async (dir) => ({
        decision: gateDecision(await readText(join(dir, "result.json"))),
      }),
      received: "",
      empty: "",
    },
    signal,
  );
}

/** Code Review: sent notes are the reviewer's Reject; without notes Pi asks for an explicit decision. */
export function reviewCodeTui(
  ctx: TabContext,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const feedback = (dir: string) => join(dir, "feedback.md");
  return reviewInHerdrTab(
    ctx,
    {
      program: "plannotator-tui",
      git: true,
      tabName: "Taskflow Code Review (plannotator-tui)",
      notice:
        "plannotator-tui: review the working tree. E sends notes to Taskflow as Reject feedback; q quits. With no notes sent, decide Approve / Reject / Cancel in Pi.",
      // The footer names the delivery command by its file name, so the receiver is called `taskflow`.
      script: `${isolate} export TASKFLOW_REVIEW_FEEDBACK="$1"; export PLANNOTATOR_TUI_DELIVER_CMD='"$TASKFLOW_REVIEW_DIR/taskflow"'; export TASKFLOW_REVIEW_DIR="$2"; exec plannotator-tui review 2>"$3"`,
      args: (dir) => [feedback(dir), dir, join(dir, "stderr.txt")],
      prepare: async (dir) => {
        await writeFile(feedback(dir), "", { flag: "wx" });
        await writeFile(
          join(dir, "taskflow"),
          // First stdout line joins plannotator-tui's status line.
          '#!/bin/sh\n{ cat; echo; } >> "$TASKFLOW_REVIEW_FEEDBACK" && echo "received; quit with q to return to Pi"\n',
          { flag: "wx", mode: 0o700 },
        );
      },
      collect: async (dir) => {
        const text = await readText(feedback(dir));
        return text.trim()
          ? {
              decision: { status: "rejected", approved: false, feedback: text },
            }
          : { feedback: "" };
      },
      received: "",
      empty:
        "No notes sent from plannotator-tui (this does not mean no findings). Decide Code Review:",
    },
    signal,
  );
}
