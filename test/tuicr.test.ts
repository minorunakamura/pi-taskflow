import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewTuicr } from "../src/tuicr.ts";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { registerTaskflow } from "./helpers.ts";

const processCall = vi.hoisted(() =>
  vi.fn<
    (
      program: string,
      args: string[],
      options: { cwd: string },
    ) => Promise<{ stdout: string; stderr: string }>
  >(),
);
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  Object.defineProperty(processCall, promisify.custom, {
    value: processCall,
    configurable: true,
  });
  return { execFile: processCall };
});
const cwd = process.cwd();
const caller = { terminal: "t-origin", pane: "p-origin" };
const reviewer = { terminal: "t-review", pane: "p-review" };
const originTab = { id: "tb-origin", terminals: [caller] };
const reviewTab = { id: "tb-review", terminals: [reviewer] };
const listing = (extra: unknown[] = []) => ({
  spaces: [
    { id: "sp-origin", machine: null, tabs: [originTab, ...extra] },
    { id: "sp-active-elsewhere", machine: null, tabs: [] },
  ],
});
const exited = {
  address: reviewer.terminal,
  state: "finished",
  reason: "exited",
  exit_code: 0,
  signal: null,
};
const waited = {
  terminal: reviewer.terminal,
  ended: true,
  reason: "exit",
  exit_code: 0,
  signal: null,
};
let output: string | undefined;
let controller: AbortController;
let ctx: Parameters<typeof reviewTuicr>[0];
const select = vi.fn<ExtensionContext["ui"]["select"]>();
type Step = [string, string, unknown];
let steps: Step[];

function enqueue(...next: Step[]) {
  steps.push(...next);
}
function preflight(list: unknown = listing()) {
  enqueue(
    ["herdr-app", "--version", "0.1.15"],
    ["hc", "--version", "0.1.21"],
    ["tuicr", "--version", "0.28.0"],
    ["git", "rev-parse", "true\n"],
    ["herdr-app", "ls", list],
  );
}
function launch(
  feedback = "# Export\n\nA comment.\n",
  hook?: () => void,
  response: unknown = {
    space: "sp-origin",
    tab: "tb-review",
    terminal: "t-review",
  },
) {
  enqueue(
    [
      "herdr-app",
      "do",
      async () => {
        const call = processCall.mock.calls.at(-1)!;
        const args = call[1];
        const payload = JSON.parse(args[2]);
        expect(args[1]).toBe("tab.new");
        expect(payload).toMatchObject({ space: "sp-origin", folder: cwd });
        expect(payload.argv.slice(0, 4)).toEqual([
          "exec",
          "/bin/sh",
          "-c",
          expect.stringContaining('exec tuicr -w --stdout >"$1" 2>"$2"'),
        ]);
        expect(payload.argv[4]).toBe("taskflow-tuicr");
        output = payload.argv[5];
        await writeFile(output!, feedback);
        hook?.();
        return response;
      },
    ],
    ["herdr-app", "ls", listing([reviewTab])],
  );
}
function focus(where: "review" | "origin" = "review") {
  enqueue(
    ...["space.select", "tab.select", "pane.focus"].map(
      (action): Step => [
        "herdr-app",
        "do",
        () => {
          const args = processCall.mock.calls.at(-1)![1];
          expect(args[1]).toBe(action);
          expect(JSON.parse(args[2])).toEqual(
            action === "space.select"
              ? { id: "sp-origin" }
              : action === "tab.select"
                ? { id: where === "review" ? reviewTab.id : originTab.id }
                : {
                    terminal:
                      where === "review" ? reviewer.terminal : caller.terminal,
                  },
          );
          return { ok: true };
        },
      ],
    ),
  );
}
function cleanup(
  extra: (typeof reviewTab)[] = [],
  state: { state: string } = exited,
) {
  enqueue(["herdr-app", "ls", listing(extra)]);
  if (extra.length === 1 && extra[0].terminals.length === 1)
    enqueue([
      "herdr-app",
      "do",
      () => {
        const args = processCall.mock.calls.at(-1)![1];
        expect(args[1]).toBe("tab.close");
        expect(JSON.parse(args[2])).toEqual({
          id: reviewTab.id,
          confirmed: true,
        });
        return { ok: true };
      },
    ]);
  enqueue(["hc", "get", state]);
  if (state.state !== "finished")
    enqueue(
      ["hc", "kill", { address: reviewer.terminal, state: "live" }],
      ["hc", "wait", { ...waited, signal: 1 }],
      ["hc", "get", { ...exited, reason: "killed", signal: 1 }],
    );
  enqueue(
    ["hc", "rm", { removed: reviewer.terminal }],
    ["herdr-app", "ls", listing()],
  );
  focus("origin");
}

beforeEach(() => {
  vi.stubEnv("HC_TERMINAL_ID", caller.terminal);
  steps = [];
  output = undefined;
  controller = new AbortController();
  select.mockReset().mockResolvedValue("Approve");
  ctx = {
    cwd,
    hasUI: true,
    ui: { select, notify: vi.fn() },
  };
  processCall
    .mockReset()
    .mockImplementation(
      async (program: string, args: string[], options: { cwd: string }) => {
        const step = steps.shift();
        expect(step, `Unexpected ${program} ${args.join(" ")}`).toBeDefined();
        expect([program, args[0]]).toEqual(step!.slice(0, 2));
        expect(options.cwd).toBe(cwd);
        if (program === "hc" && ["wait", "get", "kill", "rm"].includes(args[0]))
          expect(args[1]).toBe(reviewer.terminal);
        const value =
          typeof step![2] === "function" ? await step![2]() : step![2];
        if (value instanceof Error) throw value;
        return {
          stdout: typeof value === "string" ? value : JSON.stringify(value),
          stderr: "",
        };
      },
    );
});
afterEach(() => {
  expect(steps).toEqual([]);
  if (output) expect(existsSync(dirname(output))).toBe(false);
  vi.unstubAllEnvs();
});

describe("tuicr provider", () => {
  it.each([
    ["Approve", "approved", true],
    ["Reject", "rejected", false],
    ["Cancel", "cancelled", false],
    [undefined, "cancelled", false],
  ] as const)(
    "only explicit Pi Approve approves: %s",
    async (choice, status, approved) => {
      preflight();
      launch();
      focus();
      enqueue(
        ["hc", "wait", { ...waited, ended: false, reason: "timeout" }],
        ["hc", "wait", { ...waited, ended: false, reason: "message" }],
        ["hc", "wait", waited],
        ["hc", "get", exited],
      );
      cleanup();
      select.mockResolvedValue(choice);
      expect(await reviewTuicr(ctx, controller.signal)).toEqual({
        status,
        approved,
        feedback: "# Export\n\nA comment.\n",
      });
      expect(select).toHaveBeenCalledWith(
        expect.stringContaining("export received"),
        ["Approve", "Reject", "Cancel"],
        { signal: controller.signal },
      );
      const rmCall = processCall.mock.calls.findIndex(
        (call) => call[0] === "hc" && call[1]?.[0] === "rm",
      );
      expect(select.mock.invocationCallOrder[0]).toBeGreaterThan(
        processCall.mock.invocationCallOrder[rmCall],
      );
    },
  );

  it("labels empty stdout as comments not received, not no findings", async () => {
    preflight();
    launch("");
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    expect(await reviewTuicr(ctx)).toEqual({
      status: "approved",
      approved: true,
      feedback: "",
    });
    expect(select.mock.calls[0][0]).toContain("No exported comments received");
  });

  it.each(["noUI", "noTerminal", "aborted"])(
    "has no side effects before %s preflight",
    async (failure) => {
      if (failure === "noUI") ctx.hasUI = false;
      if (failure === "noTerminal") vi.stubEnv("HC_TERMINAL_ID", "");
      if (failure === "aborted") controller.abort();
      expect(await reviewTuicr(ctx, controller.signal)).toMatchObject({
        approved: false,
        status: failure === "aborted" ? "cancelled" : "unavailable",
      });
      expect(processCall).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
    },
  );

  it("does not create a tab if a dependency is missing", async () => {
    enqueue(
      ["herdr-app", "--version", new Error("ENOENT")],
      ["hc", "--version", "0.1.21"],
      ["tuicr", "--version", "0.28.0"],
    );
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("ENOENT"),
    });
  });

  it.each([
    listing([]),
    { spaces: [{ id: "remote", machine: "ssh-host", tabs: [originTab] }] },
  ])(
    "rejects ambiguous/missing or remote origin without active fallback",
    async (list) => {
      // Remove caller for the missing case.
      if (list.spaces[0].id === "sp-origin") list.spaces[0].tabs = [];
      preflight(list);
      expect(await reviewTuicr(ctx)).toMatchObject({
        status: "error",
        approved: false,
      });
    },
  );

  it("rejects invalid JSON before launch", async () => {
    preflight();
    steps.at(-1)![2] = "not json";
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
  });

  it.each([
    { ...exited, state: "live" },
    { ...exited, reason: "lost" },
    { ...exited, reason: "killed", signal: "SIGTERM" },
  ])("does not approve killed/lost/recovered shells: %j", async (state) => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", state]);
    cleanup([], state);
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("does not approve a nonzero exit", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", { ...waited, exit_code: 1 }]);
    cleanup();
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("collects late launch IDs on abort and waits for owned Terminal exit before rm", async () => {
    preflight();
    launch("", () => controller.abort());
    cleanup([reviewTab], { ...exited, state: "live" });
    expect(await reviewTuicr(ctx, controller.signal)).toMatchObject({
      status: "cancelled",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
    for (const call of processCall.mock.calls.filter(
      (c) => c[0] === "hc" && c[1]?.[0] !== "--version",
    ))
      expect(call[1]?.[1]).toBe(reviewer.terminal);
  });

  it("does not remove a still-running cleanup Terminal after a wait check-in", async () => {
    preflight();
    launch("", () => controller.abort());
    cleanup([reviewTab], { ...exited, state: "live" });
    const waitIndex = steps.findIndex(
      (step) => step[0] === "hc" && step[1] === "wait",
    );
    steps[waitIndex][2] = { ...waited, ended: false, reason: "timeout" };
    steps.splice(waitIndex + 1, 2); // No get/rm without exit evidence.
    expect(await reviewTuicr(ctx, controller.signal)).toMatchObject({
      status: "cancelled",
      approved: false,
      error: expect.stringContaining("did not finish within the bounded wait"),
    });
    expect(
      processCall.mock.calls.some(
        (call) => call[0] === "hc" && call[1][0] === "rm",
      ),
    ).toBe(false);
  });

  it("does not close a tab containing someone else's additional Terminal", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup([
      {
        ...reviewTab,
        terminals: [reviewer, { terminal: "t-other", pane: "p-other" }],
      },
    ]);
    expect(await reviewTuicr(ctx)).toMatchObject({ approved: true });
    expect(
      processCall.mock.calls.filter(
        (c) => c[0] === "herdr-app" && c[1]?.[1] === "tab.close",
      ),
    ).toEqual([]);
  });

  it("cleanup failure prevents Pi approval and reports owned IDs", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    const rmIndex = steps.findIndex(
      (step) => step[0] === "hc" && step[1] === "rm",
    );
    steps[rmIndex][2] = new Error("cleanup failed");
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("t-review"),
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("does not hide malformed cleanup JSON", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    steps.find((step) => step[0] === "hc" && step[1] === "rm")![2] = "not-json";
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("Cleanup/return failed"),
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("ignores late approval after UI abort", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    select.mockImplementation(async () => {
      controller.abort();
      return "Approve";
    });
    expect(await reviewTuicr(ctx, controller.signal)).toMatchObject({
      status: "cancelled",
      approved: false,
    });
  });

  it("aborts while waiting without treating a late exit as completion", async () => {
    preflight();
    launch();
    focus();
    enqueue([
      "hc",
      "wait",
      () => {
        controller.abort();
        return waited;
      },
    ]);
    cleanup([reviewTab], { ...exited, state: "live" });
    expect(await reviewTuicr(ctx, controller.signal)).toMatchObject({
      status: "cancelled",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("reports unknown launch ownership without guessing cleanup", async () => {
    preflight();
    launch("", undefined, { invalid: true });
    steps.pop(); // No post-launch ls until return-to-origin cleanup.
    enqueue(["herdr-app", "ls", listing()]);
    focus("origin");
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("may remain"),
    });
    expect(
      processCall.mock.calls.some(
        (c) => c[0] === "hc" && ["kill", "rm"].includes(c[1]?.[0]),
      ),
    ).toBe(false);
  });

  it("never takes ownership of pre-existing tab/Terminal IDs from an invalid launch response", async () => {
    preflight(
      listing([
        {
          id: "tb-existing",
          terminals: [{ terminal: "t-existing", pane: "p-existing" }],
        },
      ]),
    );
    launch("", undefined, {
      space: "sp-origin",
      tab: "tb-existing",
      terminal: "t-existing",
    });
    steps.pop();
    enqueue(["herdr-app", "ls", listing()]);
    focus("origin");
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
    expect(
      processCall.mock.calls.some(
        (c) => c[0] === "hc" && ["kill", "rm"].includes(c[1]?.[0]),
      ),
    ).toBe(false);
  });

  it("does not clean an unverified Terminal contradicted by the first post-launch listing", async () => {
    preflight();
    launch("", undefined, {
      space: "sp-origin",
      tab: reviewTab.id,
      terminal: "t-other-new",
    });
    const postLaunch = listing([
      reviewTab,
      {
        id: "tb-other-new",
        terminals: [{ terminal: "t-other-new", pane: "p-other-new" }],
      },
    ]);
    steps.at(-1)![2] = postLaunch;
    enqueue(["herdr-app", "ls", postLaunch]);
    focus("origin");
    const result = await reviewTuicr(ctx);
    expect(result).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("ownership does not match"),
    });
    expect(result.error).toContain("may remain");
    expect(
      processCall.mock.calls.filter(
        (call) =>
          call[0] === "hc" && ["get", "kill", "rm"].includes(call[1][0]),
      ),
    ).toEqual([]);
    expect(
      processCall.mock.calls.some(
        (call) => call[0] === "herdr-app" && call[1][1] === "tab.close",
      ),
    ).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it("does not hide invalid JSON during terminal completion", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", "not-json"]);
    cleanup();
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("does not truncate or replace invalid UTF-8 output silently", async () => {
    preflight();
    launch();
    focus();
    enqueue(
      ["hc", "wait", waited],
      [
        "hc",
        "get",
        async () => {
          await writeFile(output!, Buffer.from([0xff]));
          return exited;
        },
      ],
    );
    cleanup();
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("treats an exact already-removed Terminal as cleaned up", async () => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    const cleanupGet = steps.findIndex(
      (step, index) =>
        index > steps.findIndex((s) => s[0] === "hc" && s[1] === "wait") + 1 &&
        step[0] === "hc" &&
        step[1] === "get",
    );
    steps[cleanupGet][2] = Object.assign(new Error("not found"), {
      code: 3,
      stdout: "",
      stderr: `${JSON.stringify({ error: { hint: "see `hc ls --all`", kind: "not_found", message: `no terminal "${reviewer.terminal}"` } })}\n`,
    });
    steps.splice(cleanupGet + 1, 1); // No rm for an already-absent exact ID.
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "approved",
      approved: true,
    });
  });

  it.each([
    { code: 1, stderr: '{"error":{"kind":"not_found"}}' },
    { code: 3, stderr: "not-json" },
    { code: 3, stderr: '{"error":{"kind":"permission_denied"}}' },
    { code: 3, stdout: '{"error":{"kind":"not_found"}}', stderr: "" },
  ])("does not hide other cleanup errors: %j", async (error) => {
    preflight();
    launch();
    focus();
    enqueue(["hc", "wait", waited], ["hc", "get", exited]);
    cleanup();
    steps.find((step) => step[0] === "hc" && step[1] === "rm")![2] =
      Object.assign(new Error("cleanup failed"), error);
    expect(await reviewTuicr(ctx)).toMatchObject({
      status: "error",
      approved: false,
      error: expect.stringContaining("Cleanup/return failed"),
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("waits for tuicr cleanup on actual Extension shutdown", async () => {
    const harness = await registerTaskflow(createEventBus(), cwd);
    const settings = {
      ...harness.settingsManager.getSettings(),
      taskflow: { codeReviewProvider: "tuicr" },
    };
    harness.settingsManager.applyOverrides(settings);
    const tool = harness.register.mock.calls.find(
      ([t]) => t.name === "taskflow_code_review",
    )![0];
    let shutdown: Promise<unknown> | undefined;
    preflight();
    launch();
    focus();
    enqueue([
      "hc",
      "wait",
      () => {
        shutdown = harness.shutdown();
        return waited;
      },
    ]);
    cleanup([reviewTab], { ...exited, state: "live" });
    const context: typeof harness.context = Object.create(harness.context, {
      hasUI: { value: true },
      ui: { value: ctx.ui },
    });
    expect(
      await tool.execute("review", {}, undefined, undefined, context),
    ).toMatchObject({
      details: { status: "cancelled", approved: false },
      isError: false,
    });
    await shutdown;
    expect(select).not.toHaveBeenCalled();
  });

  it("routes the real tool to tuicr and keeps isError on noUI", async () => {
    const harness = await registerTaskflow(createEventBus(), cwd);
    const settings = {
      ...harness.settingsManager.getSettings(),
      taskflow: { codeReviewProvider: "tuicr" },
    };
    harness.settingsManager.applyOverrides(settings);
    const tool = harness.register.mock.calls.find(
      ([t]) => t.name === "taskflow_code_review",
    )![0];
    expect(tool.executionMode).toBe("sequential");
    expect(
      await tool.execute("review", {}, undefined, undefined, harness.context),
    ).toMatchObject({
      details: { status: "unavailable", approved: false },
      isError: true,
    });
  });
});
