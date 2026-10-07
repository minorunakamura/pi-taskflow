import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	reviewCode,
	reviewPlan,
	type ReviewResult,
} from "../src/plannotator.ts";
import { codeReviewEnabled } from "../src/settings.ts";

export default function taskflow(pi: ExtensionAPI) {
	const shutdown = new AbortController();
	pi.on("session_shutdown", () => shutdown.abort());

	pi.registerTool(
		defineTool({
			name: "taskflow_plan_review",
			label: "Taskflow Plan Review",
			description:
				"Submit a completed Plan directly to Plannotator without entering Plan Mode. Only explicit Approve is approval. On rejection, use the returned feedback to revise and resubmit. Closing the browser leaves review pending; cancel in Pi to stop waiting.",
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
				"Review current code changes in Plannotator when taskflow.plannotatorCodeReview is enabled in Pi settings; otherwise return skipped without opening Plannotator. When enabled, Implementation is complete only after explicit Approve. On Reject, the Root Agent must decide what to fix, recheck, and resubmit. Cancel or failure is not approval; cancel in Pi to stop waiting.",
			parameters: Type.Object({}),
			async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
				const result: ReviewResult | { status: "skipped"; approved: false } =
					codeReviewEnabled(pi.getSettings())
						? await reviewCode(
								pi.events,
								ctx.cwd,
								AbortSignal.any([shutdown.signal, ...(signal ? [signal] : [])]),
							)
						: { status: "skipped", approved: false };
				return {
					content: [{ type: "text", text: JSON.stringify(result) }],
					details: result,
					isError: result.status === "error" || result.status === "unavailable",
				};
			},
		}),
	);
}
