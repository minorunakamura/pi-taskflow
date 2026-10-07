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
	taskflow: { plannotatorCodeReview: value },
});
const enabled = (trusted = true) =>
	codeReviewEnabled(
		SettingsManager.create(cwd, agentDir, {
			projectTrusted: trusted,
		}).getSettings(),
	);

describe("taskflow.plannotatorCodeReview through Pi SettingsManager", () => {
	it("defaults to false with no settings files", () => {
		expect(enabled()).toBe(false);
	});

	it.each([
		{},
		{ taskflow: {} },
		{ subagents: { model: "unchanged", thinking: "high" } },
	])("defaults to false when the setting is absent: %j", (config) => {
		configure(config);
		expect(enabled()).toBe(false);
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

	it("inherits Global when Project does not set the value", () => {
		configure(setting(true), { taskflow: {} });
		expect(enabled()).toBe(true);
	});

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
		expect(enabled(false)).toBe(false);
		configure({}, setting("invalid"));
		expect(enabled(false)).toBe(false);
	});

	it.each(["true", "false", 0, 1, null, [], {}])(
		"rejects invalid boolean values in either trusted scope: %j",
		(value) => {
			configure(setting(value));
			expect(() => enabled()).toThrow(
				"Invalid taskflow.plannotatorCodeReview setting: expected a boolean.",
			);
			configure(setting(false), setting(value));
			expect(() => enabled()).toThrow(
				"Invalid taskflow.plannotatorCodeReview setting: expected a boolean.",
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

	it("does not change Agent model or thinking-level settings", () => {
		const subagents = { model: "owned-by-subagents", thinking: "high" };
		configure({ ...setting(true), subagents });
		const settings = SettingsManager.create(cwd, agentDir).getSettings();
		const before = structuredClone(settings);
		expect(codeReviewEnabled(settings)).toBe(true);
		expect(settings).toEqual(before);
		expect(settings).toHaveProperty("subagents", subagents);
	});
});
