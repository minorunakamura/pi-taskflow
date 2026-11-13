import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codeReviewEnabled } from "../src/settings.ts";

let dir: string;
let cwd: string;
let agentDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "taskflow-settings-"));
  cwd = join(dir, "project");
  agentDir = join(dir, "agent");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  mkdirSync(agentDir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function configure(global: unknown, project?: unknown) {
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(global));
  if (project !== undefined) {
    writeFileSync(join(cwd, ".pi/settings.json"), JSON.stringify(project));
  }
}

const setting = (value: unknown) => ({
  taskflow: { codeReviewEnabled: value },
});
const enabled = (trusted = true) =>
  codeReviewEnabled(
    SettingsManager.create(cwd, agentDir, {
      projectTrusted: trusted,
    }).getSettings(),
  );

describe("taskflow.codeReviewEnabled through Pi SettingsManager", () => {
  it("defaults to true with no settings files", () => {
    expect(enabled()).toBe(true);
  });

  it("defaults to true for explicitly undefined namespace or value", () => {
    const settings = SettingsManager.inMemory().getSettings();
    const missingNamespace = { ...settings, taskflow: undefined };
    const missingValue = {
      ...settings,
      taskflow: { codeReviewEnabled: undefined },
    };
    expect(codeReviewEnabled(missingNamespace)).toBe(true);
    expect(codeReviewEnabled(missingValue)).toBe(true);
  });

  it.each([
    {},
    { taskflow: {} },
    { subagents: { model: "unchanged", thinking: "high" } },
  ])("defaults to true when the setting is absent: %j", (config) => {
    configure(config);
    expect(enabled()).toBe(true);
  });

  it.each([false, true, "invalid", null, 0, [], {}])(
    "ignores the legacy setting, including invalid values: %j",
    (plannotatorCodeReview) => {
      configure({ taskflow: { plannotatorCodeReview } });
      expect(enabled()).toBe(true);
    },
  );

  it.each([false, true])(
    "uses the new value %s even with an invalid legacy value",
    (value) => {
      configure({
        taskflow: {
          codeReviewEnabled: value,
          plannotatorCodeReview: "invalid",
        },
      });
      expect(enabled()).toBe(value);
    },
  );

  it("does not access the legacy value in the effective snapshot", () => {
    const settings = {
      ...SettingsManager.inMemory().getSettings(),
      taskflow: {},
    };
    Object.defineProperty(settings.taskflow, "plannotatorCodeReview", {
      get() {
        throw new Error("Legacy value must not be read.");
      },
    });
    expect(codeReviewEnabled(settings)).toBe(true);
  });

  it.each([false, true])("reads the Global value %s", (value) => {
    configure(setting(value));
    expect(enabled()).toBe(value);
  });

  it.each([false, true])("reads a Project-only value %s", (value) => {
    configure({}, setting(value));
    expect(enabled()).toBe(value);
  });

  it.each([false, true])("Project overrides Global with %s", (value) => {
    configure(setting(!value), setting(value));
    expect(enabled()).toBe(value);
  });

  it.each([false, true])(
    "inherits Global %s when Project does not set the value",
    (value) => {
      configure(setting(value), { taskflow: {} });
      expect(enabled()).toBe(value);
    },
  );

  it.each([false, true])(
    "ignores an untrusted Project override of Global %s",
    (value) => {
      configure(setting(value), setting(!value));
      expect(enabled(false)).toBe(value);
    },
  );

  it("does not read or validate an untrusted Project file", () => {
    configure({});
    writeFileSync(join(cwd, ".pi/settings.json"), "invalid JSON");
    expect(enabled(false)).toBe(true);
    configure({}, setting("invalid"));
    expect(enabled(false)).toBe(true);
  });

  it.each(["true", "false", 0, 1, null, [], {}])(
    "rejects invalid boolean values in either trusted scope: %j",
    (value) => {
      configure({
        taskflow: { codeReviewEnabled: value, plannotatorCodeReview: false },
      });
      expect(() => enabled()).toThrow(
        "Invalid taskflow.codeReviewEnabled setting: expected a boolean.",
      );
      configure(setting(false), setting(value));
      expect(() => enabled()).toThrow(
        "Invalid taskflow.codeReviewEnabled setting: expected a boolean.",
      );
    },
  );

  it.each([null, "invalid", true, 1, []])(
    "rejects malformed taskflow namespace values: %j",
    (value) => {
      configure({ taskflow: value });
      expect(() => enabled()).toThrow(
        "Invalid taskflow setting: expected an object.",
      );
    },
  );

  it.each([undefined, false, true])(
    "does not mutate the snapshot or migrate legacy settings with new value %s",
    (value) => {
      const subagents = { model: "owned-by-subagents", thinking: "high" };
      configure({
        taskflow: { codeReviewEnabled: value, plannotatorCodeReview: false },
        subagents,
      });
      const settings = SettingsManager.create(cwd, agentDir).getSettings();
      const before = structuredClone(settings);
      expect(codeReviewEnabled(settings)).toBe(value ?? true);
      expect(settings).toEqual(before);
      expect(settings).toHaveProperty("subagents", subagents);
    },
  );
});
