import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Reads Pi's effective SettingsManager snapshot, including project trust and overrides. */
export function codeReviewSettings(
  settings: ReturnType<ExtensionAPI["getSettings"]>,
): { enabled: boolean; provider: "plannotator" | "tuicr" } {
  const taskflow = "taskflow" in settings ? settings.taskflow : undefined;
  if (taskflow === undefined) return { enabled: true, provider: "plannotator" };
  if (
    typeof taskflow !== "object" ||
    taskflow === null ||
    Array.isArray(taskflow)
  ) {
    throw new Error("Invalid taskflow setting: expected an object.");
  }
  const enabled =
    "codeReviewEnabled" in taskflow ? taskflow.codeReviewEnabled : undefined;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new Error(
      "Invalid taskflow.codeReviewEnabled setting: expected a boolean.",
    );
  }
  const provider =
    "codeReviewProvider" in taskflow ? taskflow.codeReviewProvider : undefined;
  if (
    provider !== undefined &&
    provider !== "plannotator" &&
    provider !== "tuicr"
  ) {
    throw new Error(
      'Invalid taskflow.codeReviewProvider setting: expected "plannotator" or "tuicr".',
    );
  }
  return { enabled: enabled ?? true, provider: provider ?? "plannotator" };
}
