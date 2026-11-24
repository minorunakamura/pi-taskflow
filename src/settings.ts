import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Reads Pi's effective SettingsManager snapshot, including project trust and overrides. */
export function codeReviewSettings(
  settings: ReturnType<ExtensionAPI["getSettings"]>,
): {
  enabled: boolean;
  provider: "plannotator" | "tuicr";
  plannotatorUi: "tui" | "browser";
} {
  const taskflow = "taskflow" in settings ? settings.taskflow : undefined;
  if (taskflow === undefined)
    return { enabled: true, provider: "plannotator", plannotatorUi: "tui" };
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
  return {
    enabled: enabled ?? true,
    provider: provider ?? "plannotator",
    plannotatorUi: plannotatorUi(settings),
  };
}

/** Plan and Code Review share one Plannotator UI choice; tui (plannotator-tui) is the default. */
export function plannotatorUi(
  settings: ReturnType<ExtensionAPI["getSettings"]>,
): "tui" | "browser" {
  const taskflow = "taskflow" in settings ? settings.taskflow : undefined;
  if (taskflow === undefined) return "tui";
  if (
    typeof taskflow !== "object" ||
    taskflow === null ||
    Array.isArray(taskflow)
  ) {
    throw new Error("Invalid taskflow setting: expected an object.");
  }
  const ui = "plannotatorUi" in taskflow ? taskflow.plannotatorUi : undefined;
  if (ui !== undefined && ui !== "tui" && ui !== "browser") {
    throw new Error(
      'Invalid taskflow.plannotatorUi setting: expected "tui" or "browser".',
    );
  }
  return ui ?? "tui";
}
