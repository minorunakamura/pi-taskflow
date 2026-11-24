import { readFile, writeFile } from "node:fs/promises";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  gateDecision,
  reviewCodeTui,
  reviewPlanTui,
} from "../src/plannotator-tui.ts";

const processCall = vi.hoisted(() =>
  vi.fn<(program: string, args: string[]) => Promise<{ stdout: string }>>(),
);
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  Object.defineProperty(processCall, promisify.custom, {
    value: processCall,
    configurable: true,
  });
  return { execFile: processCall };
});

const reviewer = { terminal: "t-review", pane: "p-review" };
const origin = {
  id: "tb-origin",
  terminals: [{ terminal: "t-o", pane: "p-o" }],
};
const listing = (extra: unknown[] = []) => ({
  spaces: [{ id: "sp", machine: null, tabs: [origin, ...extra] }],
});
const reviewTab = { id: "tb-review", terminals: [reviewer] };
const exited = {
  address: reviewer.terminal,
  state: "finished",
  reason: "exited",
  exit_code: 0,
  signal: null,
};
const select = vi.fn<ExtensionContext["ui"]["select"]>();
const ctx = {
  cwd: process.cwd(),
  hasUI: true,
  ui: { select, notify: vi.fn() },
};
let argv: string[] = [];

/** Scripted happy path; `onLaunch` plays the human inside the review tab. */
function run(git: boolean, onLaunch: (argv: string[]) => Promise<void>) {
  const steps: unknown[] = [
    "1",
    "1",
    "1",
    ...(git ? ["true\n"] : []),
    listing(),
    async (args: string[]) => {
      argv = JSON.parse(args[2]).argv;
      await onLaunch(argv);
      return { space: "sp", tab: reviewTab.id, terminal: reviewer.terminal };
    },
    listing([reviewTab]),
    { ok: true },
    { ok: true },
    { ok: true },
    {
      terminal: reviewer.terminal,
      ended: true,
      reason: "exit",
      exit_code: 0,
      signal: null,
    },
    exited,
    listing([reviewTab]),
    { ok: true },
    exited,
    { removed: reviewer.terminal },
    listing(),
    { ok: true },
    { ok: true },
    { ok: true },
  ];
  processCall.mockImplementation(async (_program, args) => {
    const step = steps.shift();
    const value = typeof step === "function" ? await step(args) : step;
    return {
      stdout: typeof value === "string" ? value : JSON.stringify(value),
    };
  });
  return () => expect(steps).toEqual([]);
}

beforeEach(() => {
  vi.stubEnv("HC_TERMINAL_ID", "t-o");
  processCall.mockReset();
  select.mockReset().mockResolvedValue("Approve");
});
afterEach(() => vi.unstubAllEnvs());

describe("gateDecision", () => {
  it.each([
    ['{"decision":"approved"}', { status: "approved", approved: true }],
    [
      '{"decision":"approved","feedback":"n"}',
      { status: "approved", approved: true, feedback: "n" },
    ],
    [
      '{"decision":"annotated","feedback":"f"}',
      { status: "rejected", approved: false, feedback: "f" },
    ],
    ['{"decision":"dismissed"}', { status: "cancelled", approved: false }],
  ])("maps %s", (text, result) => {
    expect(gateDecision(text)).toEqual(result);
  });
  it.each([
    '{"decision":"ok"}',
    '{"feedback":1,"decision":"approved"}',
    "[]",
    "null",
  ])("rejects %s", (text) => expect(() => gateDecision(text)).toThrow());
});

describe("plannotator-tui provider", () => {
  it("returns the gate decision for a Plan without a Pi dialog", async () => {
    const done = run(false, async ([, , , script, , plan, result]) => {
      expect(script).toContain(
        'exec plannotator-tui "$1" --gate --json --result-file "$2"',
      );
      expect(script).toContain("unset HERDR_ENV");
      expect(await readFile(plan, "utf8")).toBe("# Plan");
      await writeFile(result, '{"decision":"annotated","feedback":"Fix X"}\n');
    });
    expect(await reviewPlanTui(ctx, { planContent: "# Plan" })).toEqual({
      status: "rejected",
      approved: false,
      feedback: "Fix X",
    });
    expect(select).not.toHaveBeenCalled();
    done();
  });

  it("does not treat a missing result file as approval", async () => {
    const done = run(false, async () => {});
    expect(await reviewPlanTui(ctx, { planContent: "# Plan" })).toMatchObject({
      status: "error",
      approved: false,
    });
    done();
  });

  it("returns sent Code Review notes as Reject without a Pi dialog", async () => {
    const done = run(true, async ([, , , script, , feedback, dir]) => {
      expect(script).toContain("exec plannotator-tui review");
      const env = { ...process.env, TASKFLOW_REVIEW_FEEDBACK: feedback };
      const { execFileSync } =
        await vi.importActual<typeof import("node:child_process")>(
          "node:child_process",
        );
      expect(
        execFileSync(`${dir}/taskflow`, {
          input: "## Annotation 1",
          env,
        }).toString(),
      ).toContain("received");
    });
    expect(await reviewCodeTui(ctx)).toEqual({
      status: "rejected",
      approved: false,
      feedback: "## Annotation 1\n",
    });
    expect(select).not.toHaveBeenCalled();
    done();
  });

  it("asks Pi for an explicit decision when no notes were sent", async () => {
    const done = run(true, async () => {});
    expect(await reviewCodeTui(ctx)).toEqual({
      status: "approved",
      approved: true,
      feedback: "",
    });
    expect(select.mock.calls[0][0]).toContain("No notes sent");
    done();
  });
});
