import { randomUUID } from "node:crypto";
import type { EventBus } from "@earendil-works/pi-coding-agent";

export type PlanReviewInput = {
	planContent: string;
	planFilePath?: string;
};

export type PlanReviewResult = {
	status: "approved" | "rejected" | "cancelled" | "unavailable" | "error";
	approved: boolean;
	feedback?: string;
	error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Uses Plannotator's public event API; never enters Plan Mode or saves a Plan. */
export function reviewPlan(
	events: EventBus,
	input: PlanReviewInput,
	signal?: AbortSignal,
): Promise<PlanReviewResult> {
	if (
		typeof input.planContent !== "string" ||
		!input.planContent.trim() ||
		(input.planFilePath !== undefined &&
			(typeof input.planFilePath !== "string" || !input.planFilePath.trim()))
	) {
		return Promise.resolve({
			status: "error",
			approved: false,
			error: "Expected non-empty planContent and, if provided, planFilePath.",
		});
	}

	// A decision can arrive before the start response. Gate correlation on that response.
	let resolveStarted!: (reviewId: string | undefined) => void;
	const started = new Promise<string | undefined>((resolve) => {
		resolveStarted = resolve;
	});

	return new Promise((resolve) => {
		let settled = false;
		let acknowledged = false;
		const finish = (result: PlanReviewResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(startTimeout);
			unsubscribe();
			signal?.removeEventListener("abort", cancel);
			resolveStarted(undefined);
			resolve(result);
		};
		const cancel = () => finish({ status: "cancelled", approved: false });
		const unsubscribe = events.on("plannotator:review-result", async (data) => {
			const reviewId = await started;
			if (settled || !reviewId || !isRecord(data) || data.reviewId !== reviewId)
				return;

			const optionalFields = [
				"feedback",
				"savedPath",
				"agentSwitch",
				"permissionMode",
			];
			if (
				typeof data.approved !== "boolean" ||
				optionalFields.some(
					(key) => data[key] !== undefined && typeof data[key] !== "string",
				) ||
				Object.keys(data).some(
					(key) => !["reviewId", "approved", ...optionalFields].includes(key),
				)
			) {
				finish({
					status: "error",
					approved: false,
					error: "Invalid Plannotator review result.",
				});
				return;
			}
			finish({
				status: data.approved ? "approved" : "rejected",
				approved: data.approved,
				...(typeof data.feedback === "string" && { feedback: data.feedback }),
			});
		});
		// Only startup is timed out. Silence/browser close is never implicit approval;
		// the human review stays pending until a decision or Pi cancellation.
		const startTimeout = setTimeout(
			() =>
				finish({
					status: "unavailable",
					approved: false,
					error:
						"Plannotator did not acknowledge plan-review within 5 seconds.",
				}),
			5_000,
		);
		if (signal?.aborted) {
			cancel();
			return;
		}
		signal?.addEventListener("abort", cancel, { once: true });

		try {
			events.emit("plannotator:request", {
				requestId: randomUUID(),
				action: "plan-review",
				payload: input,
				respond: (response: unknown) => {
					if (settled || acknowledged) return;
					if (
						isRecord(response) &&
						(response.status === "unavailable" ||
							response.status === "error") &&
						(response.error === undefined || typeof response.error === "string")
					) {
						finish({
							status: response.status,
							approved: false,
							error: response.error ?? "Plannotator review failed.",
						});
					} else if (
						isRecord(response) &&
						response.status === "handled" &&
						isRecord(response.result) &&
						response.result.status === "pending" &&
						typeof response.result.reviewId === "string" &&
						response.result.reviewId.trim()
					) {
						acknowledged = true;
						clearTimeout(startTimeout);
						resolveStarted(response.result.reviewId);
					} else {
						finish({
							status: "error",
							approved: false,
							error: "Invalid Plannotator start response.",
						});
					}
				},
			});
		} catch (error) {
			finish({
				status: "error",
				approved: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
}
