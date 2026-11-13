import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Reads Pi's effective SettingsManager snapshot, including project trust and overrides. */
export function codeReviewEnabled(
  settings: ReturnType<ExtensionAPI["getSettings"]>,
): boolean {
  if (!("taskflow" in settings) || settings.taskflow === undefined) return true;
  const taskflow = settings.taskflow;
  if (
    typeof taskflow !== "object" ||
    taskflow === null ||
    Array.isArray(taskflow)
  ) {
    throw new Error("Invalid taskflow setting: expected an object.");
  }
  if (
    !("codeReviewEnabled" in taskflow) ||
    taskflow.codeReviewEnabled === undefined
  ) {
    return true;
  }
  const value = taskflow.codeReviewEnabled;
  if (typeof value !== "boolean") {
    throw new Error(
      "Invalid taskflow.codeReviewEnabled setting: expected a boolean.",
    );
  }
  return value;
}
