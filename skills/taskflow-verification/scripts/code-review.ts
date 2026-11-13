import { appendFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
  ExtensionToolContext,
} from "@earendil-works/pi-coding-agent";
import taskflow from "../../../extensions/taskflow.ts";

/** Model-free command connection to the real tool and Pi's real dialog UI. */
export default function codeReviewVerification(pi: ExtensionAPI) {
  const evidence = process.env.TASKFLOW_EVIDENCE_DIR;
  if (!evidence || !isAbsolute(evidence))
    throw new Error(
      "Set TASKFLOW_EVIDENCE_DIR to an existing absolute run evidence directory.",
    );
  const record = (event: Record<string, unknown>) =>
    appendFileSync(
      join(evidence, "tool-events.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    );
  let review: ToolDefinition["execute"] | undefined;
  let active: AbortController | undefined;
  taskflow({
    ...pi,
    registerTool(tool) {
      pi.registerTool(tool);
      if (tool.name === "taskflow_code_review")
        review = tool.execute.bind(tool);
    },
  });
  pi.events.on("plannotator:request", (data: unknown) => {
    if (typeof data === "object" && data !== null && "action" in data)
      record({ type: "plannotator-request", action: data.action });
  });
  pi.on("session_shutdown", () => {
    record({ type: "shutdown", reviewPending: !!active });
    active?.abort();
  });
  pi.registerCommand("verify-code-review", {
    description:
      "Call the actual Taskflow Code Review tool once (no model or automatic decision)",
    handler: async (_args, ctx) => {
      if (active) {
        ctx.ui.notify("A verification review is already pending.", "warning");
        return;
      }
      if (!review)
        throw new Error("Taskflow Code Review tool was not registered.");
      const controller = new AbortController();
      active = controller;
      record({
        type: "tool-start",
        cwd: ctx.cwd,
        terminal: process.env.HC_TERMINAL_ID,
      });
      // Return command control so the cancel command remains reachable during review.
      // shortcut: Code Review uses shared context only; use a real tool context if it adds nested-tool execution.
      const context: ExtensionContext = ctx;
      void review(
        "verification-code-review",
        {},
        controller.signal,
        undefined,
        context as ExtensionToolContext,
      )
        .then(
          (result) => {
            record({ type: "tool-end", result });
            ctx.ui.notify(
              `Code Review result: ${JSON.stringify(result.details)}`,
              "info",
            );
          },
          (error: unknown) => {
            record({ type: "tool-error", error: String(error) });
            ctx.ui.notify(String(error), "error");
          },
        )
        .finally(() => {
          active = undefined;
        });
    },
  });
  pi.registerCommand("verify-code-review-cancel", {
    description: "Abort only this helper's pending Code Review invocation",
    handler: async (_args, ctx) => {
      record({ type: "tool-abort", reviewPending: !!active });
      active?.abort();
      ctx.ui.notify(
        "Verification review abort requested; observe the tool result and cleanup.",
        "info",
      );
    },
  });
}
