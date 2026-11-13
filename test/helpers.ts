import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DefaultResourceLoader,
  type EventBus,
  type ExtensionAPI,
  ExtensionRunner,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Assert } from "typebox/value";
import { vi } from "vitest";
import taskflow from "../extensions/taskflow.ts";

const requestSchema = Type.Object({
  requestId: Type.String(),
  action: Type.String(),
  payload: Type.Object({
    planContent: Type.Optional(Type.String()),
    planFilePath: Type.Optional(Type.String()),
    cwd: Type.Optional(Type.String()),
    reviewId: Type.Optional(Type.String()),
  }),
  respond: Type.Function([Type.Unknown()], Type.Void()),
});

export function readRequest(data: unknown) {
  Assert(requestSchema, data);
  return data;
}
export type Request = ReturnType<typeof readRequest>;

export function reviewSettings(value?: unknown) {
  const settings: ReturnType<ExtensionAPI["getSettings"]> & {
    taskflow?: { codeReviewEnabled: unknown };
  } = {
    ...(value !== undefined && { taskflow: { codeReviewEnabled: value } }),
  };
  return settings;
}

const unexpectedCredentialAccess = () => {
  throw new Error("Unexpected credential access in a tool test.");
};
const modelRegistry = new ModelRegistry(
  await ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: unexpectedCredentialAccess,
      list: unexpectedCredentialAccess,
      modify: unexpectedCredentialAccess,
      delete: unexpectedCredentialAccess,
    },
  }),
);

const observe = (pi: ExtensionAPI) => ({
  register: vi.spyOn(pi, "registerTool"),
  on: vi.spyOn(pi, "on"),
  commands: vi.spyOn(pi, "registerCommand"),
});

export async function registerTaskflow(
  events: EventBus,
  cwd: string,
  value?: unknown,
  factory: typeof taskflow = taskflow,
) {
  const settingsManager = SettingsManager.inMemory(reviewSettings(value));
  const getSettings = vi.fn(() => settingsManager.getSettings());
  let spies: ReturnType<typeof observe> | undefined;
  const dir = mkdtempSync(join(tmpdir(), "taskflow-tools-"));
  try {
    const loader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: dir,
      settingsManager,
      eventBus: events,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        (pi) => {
          spies = observe(pi);
          factory({ ...pi, getSettings });
        },
      ],
    });
    await loader.reload();
    const { extensions, errors, runtime } = loader.getExtensions();
    assert.deepEqual(errors, []);
    assert(spies, "Taskflow factory was not loaded.");
    const runner = new ExtensionRunner(
      extensions,
      runtime,
      cwd,
      SessionManager.inMemory(cwd),
      modelRegistry,
    );
    return {
      ...spies,
      getSettings,
      settingsManager,
      context: runner.createToolContext("call-1", undefined),
      commandContext: runner.createCommandContext(),
      shutdown: () => runner.emit({ type: "session_shutdown", reason: "quit" }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
