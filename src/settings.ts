import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Reads Pi's effective SettingsManager snapshot, including project trust and overrides. */
export function codeReviewEnabled(
	settings: ReturnType<ExtensionAPI["getSettings"]>,
): boolean {
	const taskflow = (settings as { taskflow?: unknown }).taskflow;
	if (taskflow === undefined) return false;
	if (
		typeof taskflow !== "object" ||
		taskflow === null ||
		Array.isArray(taskflow)
	) {
		throw new Error("Invalid taskflow setting: expected an object.");
	}
	const value = (taskflow as { plannotatorCodeReview?: unknown })
		.plannotatorCodeReview;
	if (value === undefined) return false;
	if (typeof value !== "boolean") {
		throw new Error(
			"Invalid taskflow.plannotatorCodeReview setting: expected a boolean.",
		);
	}
	return value;
}
