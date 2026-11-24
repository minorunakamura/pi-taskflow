import {
  defineTool,
  type ExtensionAPI,
  getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  AskParamsSchema,
  type AskResult,
  askMarkdown,
  askSummary,
  askUserQuestion,
  visible,
} from "../src/ask.ts";
import {
  reviewCode,
  reviewPlan,
  type ReviewResult,
} from "../src/plannotator.ts";
import { reviewCodeTui, reviewPlanTui } from "../src/plannotator-tui.ts";
import { codeReviewSettings, plannotatorUi } from "../src/settings.ts";
import { reviewTuicr } from "../src/tuicr.ts";

export default function taskflow(pi: ExtensionAPI) {
  const shutdown = new AbortController();
  const pendingTabs = new Set<Promise<unknown>>();
  // herdr-app tab reviews own resources; shutdown must wait for their cleanup.
  const track = async <T>(review: Promise<T>): Promise<T> => {
    pendingTabs.add(review);
    try {
      return await review;
    } finally {
      pendingTabs.delete(review);
    }
  };
  pi.on("session_shutdown", async () => {
    shutdown.abort();
    // Pi awaits shutdown handlers; finish owned-resource cleanup before it exits.
    await Promise.all(pendingTabs);
  });

  pi.registerTool(
    defineTool({
      name: "taskflow_plan_review",
      label: "Taskflow Plan Review",
      description:
        "Submit a completed Plan directly to Plannotator without entering Plan Mode. taskflow.plannotatorUi selects plannotator-tui in a dedicated local herdr-app tab (tui, default) or the browser. Only explicit Approve is approval. On rejection, use the returned feedback to revise and resubmit. If answersOnly is true, fold the user's answers into the Plan and resubmit; answers are not approval. Closing the browser leaves review pending; dismissing plannotator-tui is cancelled. Cancel in Pi to stop waiting.",
      parameters: Type.Object({
        planContent: Type.String({ minLength: 1 }),
        planFilePath: Type.Optional(Type.String({ minLength: 1 })),
      }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const reviewSignal = AbortSignal.any([
          shutdown.signal,
          ...(signal ? [signal] : []),
        ]);
        const result =
          plannotatorUi(pi.getSettings()) === "tui"
            ? await track(reviewPlanTui(ctx, params, reviewSignal))
            : await reviewPlan(pi.events, params, reviewSignal);
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
        "Review current code changes using taskflow.codeReviewProvider (plannotator by default, or tuicr in a dedicated local herdr-app tab; plannotator uses plannotator-tui in a dedicated herdr-app tab unless taskflow.plannotatorUi is browser). If taskflow.codeReviewEnabled is false, return skipped without starting either provider. For plannotator-tui, notes sent with E are returned as Reject feedback; quitting without notes asks for a decision in Pi. For tuicr, press y or type :clip then Enter to export and exit (no extra q); without export use :q then Enter, which refuses unsaved comments. Decide approval in Pi. When enabled, Implementation is complete only after explicit Approve. On Reject, the Root Agent must decide what to fix, recheck, and resubmit. Cancel or failure is not approval; cancel in Pi to stop waiting.",
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
        else if (settings.provider === "tuicr")
          result = await track(reviewTuicr(ctx, reviewSignal));
        else if (settings.plannotatorUi === "tui")
          result = await track(reviewCodeTui(ctx, reviewSignal));
        else result = await reviewCode(pi.events, ctx.cwd, reviewSignal);
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
      name: "taskflow_ask",
      label: "Taskflow Ask",
      description:
        "Show content, then ask questions through pi-ask-user-question in one call. Put the full text to approve or the full premise of the question in content as Markdown; the tool displays it, so it does not need to be repeated in the conversation. Keep question and options short and never put that text in them. Only status answered is an answer; unavailable, user-cancelled, caller-aborted, shutdown and failed are not answers or approval.",
      parameters: AskParamsSchema,
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        let result: AskResult;
        if (ctx.mode !== "tui")
          result = {
            status: "unavailable",
            reason: `taskflow_ask requires the TUI (mode: ${ctx.mode}).`,
          };
        else if (
          !pi.getAllTools().some((tool) => tool.name === "ask_user_question")
        )
          result = {
            status: "unavailable",
            reason: "pi-ask-user-question is not loaded.",
          };
        else
          result = await askUserQuestion(
            pi.events,
            params,
            signal,
            shutdown.signal,
          );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
          isError:
            result.status === "failed" || result.status === "unavailable",
        };
      },
      renderCall(args) {
        return markdownOrText(askMarkdown(args));
      },
      renderResult(result) {
        const details = result.details as AskResult | undefined;
        // Pi's own error results (e.g. invalid arguments) carry empty details and the message in content.
        const summary =
          typeof details?.status === "string"
            ? askSummary(details)
            : visible(
                result.content
                  .map((part) => (part.type === "text" ? part.text : ""))
                  .join("\n"),
              );
        return new Text(summary, 0, 0);
      },
    }),
  );
}

// Collapsed rows must still show the full content, as Markdown when the theme is available.
function markdownOrText(markdown: string) {
  try {
    const theme = getMarkdownTheme();
    // The returned styles read Pi's global theme lazily; probe it before rendering.
    theme.heading("");
    return new Markdown(markdown, 0, 0, theme);
  } catch {
    return new Text(markdown, 0, 0);
  }
}
