import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  reviewCode,
  reviewPlan,
  type ReviewResult,
} from "../src/plannotator.ts";
import { codeReviewSettings } from "../src/settings.ts";
import { reviewTuicr } from "../src/tuicr.ts";

export default function taskflow(pi: ExtensionAPI) {
  const shutdown = new AbortController();
  let pendingTuicr: Promise<ReviewResult> | undefined;
  pi.on("session_shutdown", async () => {
    shutdown.abort();
    // Pi awaits shutdown handlers; finish owned-resource cleanup before it exits.
    await pendingTuicr;
  });

  pi.registerTool(
    defineTool({
      name: "taskflow_plan_review",
      label: "Taskflow Plan Review",
      description:
        "Submit a completed Plan directly to Plannotator without entering Plan Mode. Only explicit Approve is approval. On rejection, use the returned feedback to revise and resubmit. If answersOnly is true, fold the user's answers into the Plan and resubmit; answers are not approval. Closing the browser leaves review pending; cancel in Pi to stop waiting.",
      parameters: Type.Object({
        planContent: Type.String({ minLength: 1 }),
        planFilePath: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async execute(_toolCallId, params, signal) {
        const result = await reviewPlan(
          pi.events,
          params,
          AbortSignal.any([shutdown.signal, ...(signal ? [signal] : [])]),
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
          isError: result.status === "error" || result.status === "unavailable",
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "taskflow_code_review",
      label: "Taskflow Code Review",
      description:
        "Review current code changes using taskflow.codeReviewProvider (plannotator by default, or tuicr in a dedicated local herdr-app tab). If taskflow.codeReviewEnabled is false, return skipped without starting either provider. For tuicr, press y or type :clip then Enter to export and exit (no extra q); without export use :q then Enter, which refuses unsaved comments. Decide approval in Pi. When enabled, Implementation is complete only after explicit Approve. On Reject, the Root Agent must decide what to fix, recheck, and resubmit. Cancel or failure is not approval; cancel in Pi to stop waiting.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
        const settings = codeReviewSettings(pi.getSettings());
        const reviewSignal = AbortSignal.any([
          shutdown.signal,
          ...(signal ? [signal] : []),
        ]);
        let result: ReviewResult | { status: "skipped"; approved: false };
        if (!settings.enabled) result = { status: "skipped", approved: false };
        else if (settings.provider === "tuicr") {
          pendingTuicr = reviewTuicr(ctx, reviewSignal);
          try {
            result = await pendingTuicr;
          } finally {
            pendingTuicr = undefined;
          }
        } else result = await reviewCode(pi.events, ctx.cwd, reviewSignal);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
          isError: result.status === "error" || result.status === "unavailable",
        };
      },
    }),
  );
}
