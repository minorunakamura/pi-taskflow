import { stripVTControlCharacters } from "node:util";
import {
  createEventBus,
  type EventBus,
  initTheme,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import taskflow from "../extensions/taskflow.ts";
import { registerTaskflow } from "./helpers.ts";

const REQUEST = "pi-ask-user-question:request:v1";

const questions = [
  {
    question: "この分割で進めますか？",
    header: "Split",
    options: [{ label: "承認" }, { label: "修正" }],
  },
];
const input = { title: "分割案", content: "# 分割案\n\n1. Issue A", questions };

const askTool = (name: string): ToolInfo => ({
  name,
  description: name,
  parameters: Type.Object({}),
  exposure: "direct",
  sourceInfo: {
    path: name,
    source: "test",
    scope: "temporary",
    origin: "top-level",
  },
});

async function registerAsk(
  events: EventBus,
  tools: ToolInfo[] = [askTool("ask_user_question")],
) {
  const harness = await registerTaskflow(events, "/project", undefined, (pi) =>
    taskflow({ ...pi, getAllTools: () => tools }),
  );
  const tool = harness.register.mock.calls.find(
    ([registered]) => registered.name === "taskflow_ask",
  )?.[0];
  if (!tool) throw new Error("taskflow_ask was not registered.");
  // The harness runner has no UI; override only mode to reach the TUI path.
  const tui: typeof harness.context = Object.create(harness.context, {
    mode: { value: "tui" },
  });
  return { ...harness, tool, tui };
}

function provider(events: EventBus, reply: (requestId: string) => unknown) {
  const receive = vi.fn((data: unknown) => {
    const { requestId } = data as { requestId: string };
    events.emit(`pi-ask-user-question:reply:${requestId}`, reply(requestId));
  });
  events.on(REQUEST, receive);
  return receive;
}

const answered = (requestId: string) => ({
  version: 1,
  requestId,
  success: true,
  result: {
    status: "answered",
    questions: [],
    answers: { "この分割で進めますか？": "承認" },
    selections: [],
    cancelled: false,
  },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe("taskflow_ask execute", () => {
  it("emits a new v1 request and returns the pi-ask-user-question result", async () => {
    const events = createEventBus();
    const receive = provider(events, answered);
    const { tool, tui } = await registerAsk(events);
    const result = await tool.execute(
      "call-1",
      input,
      undefined,
      undefined,
      tui,
    );
    const request = receive.mock.calls[0][0] as { requestId: string };
    expect(request).toEqual({
      version: 1,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: "分割案",
      questions,
    });
    const details = answered(request.requestId).result;
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify(details) }],
      details,
      isError: false,
    });
    await tool.execute("call-2", input, undefined, undefined, tui);
    expect(receive.mock.calls[1][0]).not.toMatchObject({
      requestId: request.requestId,
    });
    expect(receive.mock.calls[1][0]).toMatchObject({ version: 1 });
  });
});

describe("taskflow_ask results", () => {
  it("returns multiple questions, multiSelect and Other answers unchanged", async () => {
    const events = createEventBus();
    const many = [
      ...questions,
      {
        question: "対象を選んでください",
        options: [{ label: "A" }, { label: "B" }, { label: "C" }],
        multiSelect: true,
      },
      { question: "補足は？", options: [], allowOther: true },
    ];
    const result = {
      status: "answered",
      questions: many,
      answers: {
        "この分割で進めますか？": "承認",
        対象を選んでください: ["A", "C"],
        "補足は？": "自由入力の補足",
      },
      selections: [
        {
          question: "補足は？",
          header: "Q3",
          value: "自由入力の補足",
          labels: [],
          customText: "自由入力の補足",
          selectedIndices: [],
        },
      ],
      cancelled: false,
    };
    const receive = provider(events, (requestId) => ({
      version: 1,
      requestId,
      success: true,
      result,
    }));
    const { tool, tui } = await registerAsk(events);
    const output = await tool.execute(
      "call-1",
      { content: "前提", questions: many },
      undefined,
      undefined,
      tui,
    );
    expect(receive.mock.calls[0][0]).toMatchObject({ questions: many });
    expect(receive.mock.calls[0][0]).not.toHaveProperty("title");
    expect(output).toEqual({
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
      isError: false,
    });
  });

  it.each(["user-cancelled", "caller-aborted", "shutdown"])(
    "keeps %s as a cancelled, unanswered result",
    async (status) => {
      const events = createEventBus();
      provider(events, (requestId) => ({
        version: 1,
        requestId,
        success: true,
        result: {
          status,
          questions: [],
          answers: {},
          selections: [],
          cancelled: true,
        },
      }));
      const { tool, tui } = await registerAsk(events);
      expect(
        await tool.execute("call-1", input, undefined, undefined, tui),
      ).toMatchObject({
        details: { status, cancelled: true, answers: {} },
        isError: false,
      });
    },
  );

  it("returns a failed reply as a tool error", async () => {
    const events = createEventBus();
    const error = { code: "tui-unavailable", message: "No TUI." };
    provider(events, (requestId) => ({
      version: 1,
      requestId,
      success: false,
      error,
    }));
    const { tool, tui } = await registerAsk(events);
    const details = { status: "failed", error };
    expect(
      await tool.execute("call-1", input, undefined, undefined, tui),
    ).toEqual({
      content: [{ type: "text", text: JSON.stringify(details) }],
      details,
      isError: true,
    });
  });

  it.each([
    ["an undefined reply", () => undefined],
    [
      "a success:false reply without error",
      (requestId: string) => ({ version: 1, requestId, success: false }),
    ],
  ])("returns %s as a failed tool error", async (_name, reply) => {
    const events = createEventBus();
    provider(events, reply);
    const { tool, tui } = await registerAsk(events);
    expect(
      await tool.execute("call-1", input, undefined, undefined, tui),
    ).toMatchObject({
      details: { status: "failed", error: { code: "internal-error" } },
      isError: true,
    });
  });
});

describe("taskflow_ask availability", () => {
  it("returns unavailable without a request when ask_user_question is not loaded", async () => {
    const events = createEventBus();
    const receive = provider(events, answered);
    const { tool, tui } = await registerAsk(events, [askTool("read")]);
    expect(
      await tool.execute("call-1", input, undefined, undefined, tui),
    ).toMatchObject({
      details: {
        status: "unavailable",
        reason: "pi-ask-user-question is not loaded.",
      },
      isError: true,
    });
    expect(receive).not.toHaveBeenCalled();
  });

  it.each(["print", "rpc", "json"])(
    "returns unavailable without a request in %s mode",
    async (mode) => {
      const events = createEventBus();
      const receive = provider(events, answered);
      const { tool, context } = await registerAsk(events);
      const headless: typeof context = Object.create(context, {
        mode: { value: mode },
      });
      expect(
        await tool.execute("call-1", input, undefined, undefined, headless),
      ).toMatchObject({ details: { status: "unavailable" }, isError: true });
      expect(receive).not.toHaveBeenCalled();
    },
  );
});

describe("taskflow_ask cancellation", () => {
  it("emits cancel with the same requestId and stops listening when aborted", async () => {
    const events = createEventBus();
    const removed: string[] = [];
    const on = events.on.bind(events);
    events.on = (channel, handler) => {
      const off = on(channel, handler);
      return () => {
        removed.push(channel);
        off();
      };
    };
    const receive = vi.fn();
    const cancel = vi.fn();
    events.on(REQUEST, receive);
    events.on("pi-ask-user-question:cancel:v1", cancel);
    const { tool, tui } = await registerAsk(events);
    const controller = new AbortController();
    const result = tool.execute(
      "call-1",
      input,
      controller.signal,
      undefined,
      tui,
    );
    const { requestId } = receive.mock.calls[0][0] as { requestId: string };
    controller.abort();
    expect(await result).toMatchObject({
      details: { status: "caller-aborted", cancelled: true, answers: {} },
      isError: false,
    });
    expect(cancel).toHaveBeenCalledWith({ version: 1, requestId });
    expect(removed).toContain(`pi-ask-user-question:reply:${requestId}`);
  });

  it("stops waiting with shutdown when the Extension shuts down", async () => {
    const events = createEventBus();
    const receive = vi.fn();
    events.on(REQUEST, receive);
    const cancel = vi.fn();
    events.on("pi-ask-user-question:cancel:v1", cancel);
    const { tool, tui, shutdown } = await registerAsk(events);
    const result = tool.execute("call-1", input, undefined, undefined, tui);
    expect(receive).toHaveBeenCalledTimes(1);
    await shutdown();
    expect(await result).toMatchObject({
      details: { status: "shutdown", cancelled: true },
      isError: false,
    });
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("taskflow_ask parameters", () => {
  it.each([
    ["empty content", { content: "", questions }],
    ["blank content", { content: " \n\t ", questions }],
    ["missing content", { questions }],
    ["no questions", { content: "本文", questions: [] }],
    ["missing questions", { content: "本文" }],
  ])("rejects %s", async (_name, args) => {
    const { tool } = await registerAsk(createEventBus());
    expect(Check(tool.parameters, args)).toBe(false);
  });

  it("accepts content with questions and an optional title", async () => {
    const { tool } = await registerAsk(createEventBus());
    expect(Check(tool.parameters, input)).toBe(true);
    expect(Check(tool.parameters, { content: "本文", questions })).toBe(true);
  });
});

async function renderers() {
  const { tool } = await registerAsk(createEventBus());
  const { renderCall, renderResult } = tool;
  if (!renderCall || !renderResult) throw new Error("No renderers.");
  const context = {
    args: input,
    toolCallId: "call-1",
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/project",
    executionStarted: false,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
  };
  const theme = {} as Parameters<typeof renderCall>[1];
  return {
    call: (args: unknown) => renderCall(args, theme, context),
    result: (details: unknown, text?: string) =>
      renderResult(
        {
          content: text === undefined ? [] : [{ type: "text", text }],
          details,
        },
        { expanded: false, isPartial: false },
        theme,
        context,
      ),
  };
}
const plain = (lines: string[]) => lines.map(stripVTControlCharacters);

describe("taskflow_ask rendering", () => {
  // Pi shares the active theme through this global; removing it simulates a missing Markdown theme.
  const themeKey = Symbol.for("@earendil-works/pi-coding-agent:theme");
  const longContent = Array.from(
    { length: 40 },
    (_, index) => `${index + 1}. 分割案の行 ${index + 1}`,
  ).join("\n");
  const control = "赤\u001b[31m字\u202e反転\u2028区切り\u0007鐘\n\tタブ行";

  describe("with the Pi Markdown theme", () => {
    beforeEach(() => initTheme("dark"));

    it("renders the title and full content as Markdown while collapsed", async () => {
      const { call } = await renderers();
      const component = call({
        title: "分割案",
        content: longContent,
        questions,
      });
      expect(component).toBeInstanceOf(Markdown);
      const lines = plain(component.render(80));
      expect(lines.some((line) => line.trim() === "分割案")).toBe(true);
      for (let index = 1; index <= 40; index++)
        expect(lines.join("\n")).toContain(`分割案の行 ${index}`);
    });

    it("escapes terminal control characters but keeps newlines and tabs", async () => {
      const { call } = await renderers();
      const output = call({ content: control, questions })
        .render(80)
        .join("\n");
      for (const character of ["\u001b[31m", "\u202e", "\u2028", "\u0007"])
        expect(output).not.toContain(character);
      const text = stripVTControlCharacters(output);
      expect(text).toContain(
        "赤\\u{1b}[31m字\\u{202e}反転\\u{2028}区切り\\u{7}鐘",
      );
      expect(text).toMatch(/鐘 *\n {3}タブ行/);
    });

    it("renders partial streaming args without throwing", async () => {
      const { call } = await renderers();
      for (const args of [undefined, {}, { title: "見出し" }, { content: 1 }])
        expect(() => call(args).render(80)).not.toThrow();
    });
  });

  describe("without the Pi Markdown theme", () => {
    let saved: unknown;
    beforeEach(() => {
      const store = globalThis as Record<symbol, unknown>;
      saved = store[themeKey];
      delete store[themeKey];
    });
    afterEach(() => {
      (globalThis as Record<symbol, unknown>)[themeKey] = saved;
    });

    it("falls back to Text with the same escaped full content", async () => {
      const { call } = await renderers();
      const component = call({ title: "分割案", content: control, questions });
      expect(component).toBeInstanceOf(Text);
      const output = component.render(80).join("\n");
      for (const character of ["\u001b", "\u202e", "\u2028", "\u0007"])
        expect(output).not.toContain(character);
      expect(output).toContain("## 分割案");
      expect(output).toContain(
        "赤\\u{1b}[31m字\\u{202e}反転\\u{2028}区切り\\u{7}鐘",
      );
      expect(output).toMatch(/鐘 *\n {3}タブ行/);
    });

    it("summarizes answers, cancellation and failure without control characters", async () => {
      const { result } = await renderers();
      const text = (details: unknown) =>
        result(details)
          .render(120)
          .map((line) => line.trimEnd())
          .join("\n");
      expect(
        text({
          status: "answered",
          questions: [],
          answers: {
            "進めますか？": "承認",
            "対象\u001b]0;x\u0007": ["A", "C"],
          },
          selections: [],
          cancelled: false,
        }),
      ).toBe("進めますか？ → 承認\n対象\\u{1b}]0;x\\u{7} → A, C");
      expect(
        text({
          status: "user-cancelled",
          questions: [],
          answers: {},
          selections: [],
          cancelled: true,
        }),
      ).toBe("user-cancelled (cancelled, not answered)");
      expect(
        text({
          status: "failed",
          error: { code: "internal-error", message: "boom\u001b[2J" },
        }),
      ).toBe("failed: internal-error: boom\\u{1b}[2J");
      expect(text({ status: "unavailable", reason: "no TUI" })).toBe(
        "unavailable: no TUI",
      );
    });

    it("shows Pi's error text when details has no status", async () => {
      const { result } = await renderers();
      const output = result({}, "Validation failed\u001b[2J")
        .render(120)
        .map((line) => line.trimEnd())
        .join("\n");
      expect(output).toBe("Validation failed\\u{1b}[2J");
      expect(output).not.toContain("undefined");
    });
  });
});
