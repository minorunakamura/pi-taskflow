import {
	createEventBus,
	type EventBus,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import taskflow from "../extensions/taskflow.ts";
import { type PlanReviewInput, reviewPlan } from "../src/plannotator.ts";

const plan = { planContent: "# Completed Plan", planFilePath: "docs/plan.md" };
const pending = {
	status: "handled",
	result: { status: "pending", reviewId: "review-1" },
};
type Request = {
	requestId: string;
	action: string;
	payload: PlanReviewInput;
	respond: (response: unknown) => void;
};

function provider(events: EventBus, response: unknown = pending) {
	const receive = vi.fn((data: unknown) => {
		(data as Request).respond(response);
	});
	events.on("plannotator:request", receive);
	return receive;
}

function registerTool(events: EventBus) {
	const register = vi.fn<ExtensionAPI["registerTool"]>();
	const on = vi.fn();
	taskflow({ events, registerTool: register, on } as unknown as ExtensionAPI);
	return { tool: register.mock.calls[0][0], register, on };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	expect(vi.getTimerCount()).toBe(0);
	vi.useRealTimers();
});

describe("Plannotator bridge", () => {
	it.each([plan, { planContent: plan.planContent }])(
		"starts plan-review with the supplied input, not Plan Mode: %j",
		async (input) => {
			const events = createEventBus();
			const receive = provider(events);
			const result = reviewPlan(events, input);
			const request = receive.mock.calls[0][0] as Request;
			expect(request).toMatchObject({ action: "plan-review", payload: input });
			expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
			events.emit("plannotator:review-result", {
				reviewId: "review-1",
				approved: true,
			});
			expect(await result).toEqual({ status: "approved", approved: true });
			expect(receive).toHaveBeenCalledTimes(1);
		},
	);

	it("returns Reject feedback so the Root Agent can revise and resubmit", async () => {
		const events = createEventBus();
		provider(events);
		const result = reviewPlan(events, plan);
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			approved: false,
			feedback: "Add a regression test.",
		});
		expect(await result).toEqual({
			status: "rejected",
			approved: false,
			feedback: "Add a regression test.",
		});
		const resubmitted = reviewPlan(events, {
			planContent: "# Revised Plan\nAdd a regression test.",
		});
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			approved: true,
			feedback: "Keep this note.",
		});
		expect(await resubmitted).toEqual({
			status: "approved",
			approved: true,
			feedback: "Keep this note.",
		});
	});

	it.each([false, true])(
		"cancels safely (already aborted: %s)",
		async (alreadyAborted) => {
			const events = createEventBus();
			const receive = provider(events);
			const abort = new AbortController();
			if (alreadyAborted) abort.abort();
			const result = reviewPlan(events, plan, abort.signal);
			abort.abort();
			events.emit("plannotator:review-result", {
				reviewId: "review-1",
				approved: true,
			});
			expect(await result).toEqual({ status: "cancelled", approved: false });
			expect(receive).toHaveBeenCalledTimes(alreadyAborted ? 0 : 1);
		},
	);

	it("keeps an abandoned/closed browser review unapproved until cancellation", async () => {
		const events = createEventBus();
		provider(events);
		const abort = new AbortController();
		const settled = vi.fn();
		const result = reviewPlan(events, plan, abort.signal).then(settled);
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(settled).not.toHaveBeenCalled();
		abort.abort();
		await result;
		expect(settled).toHaveBeenCalledWith({
			status: "cancelled",
			approved: false,
		});
	});

	it("reports an absent or unresponsive Plannotator within the startup deadline", async () => {
		const result = reviewPlan(createEventBus(), plan);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await result).toMatchObject({
			status: "unavailable",
			approved: false,
		});
	});

	it.each(["unavailable", "error"])(
		"returns a Plannotator %s, never approval",
		async (status) => {
			const events = createEventBus();
			provider(events, { status, error: "Browser could not start." });
			expect(await reviewPlan(events, plan)).toEqual({
				status,
				approved: false,
				error: "Browser could not start.",
			});
		},
	);

	it("fails safely if emitting the request throws", async () => {
		const events = createEventBus();
		vi.spyOn(events, "emit").mockImplementation(() => {
			throw new Error("Event bus failure.");
		});
		expect(await reviewPlan(events, plan)).toEqual({
			status: "error",
			approved: false,
			error: "Event bus failure.",
		});
	});

	it.each([
		null,
		[],
		{ approved: true },
		{ status: "handled", result: { approved: true } },
		{ status: "handled", result: { status: "pending", reviewId: " " } },
		{ status: "handled", result: { status: "pending", reviewId: 1 } },
		{ status: "cancelled" },
		{ status: "error", error: true },
	])("rejects invalid/unexpected start responses: %j", async (response) => {
		const events = createEventBus();
		provider(events, response);
		expect(await reviewPlan(events, plan)).toMatchObject({
			status: "error",
			approved: false,
		});
	});

	it.each([
		{},
		{ approved: "true" },
		{ approved: 1 },
		{ approved: true, feedback: {} },
		{ approved: true, savedPath: 1 },
		{ approved: true, exit: true },
		{ approved: true, status: "cancelled" },
	])("rejects invalid/unexpected decisions: %j", async (decision) => {
		const events = createEventBus();
		provider(events);
		const result = reviewPlan(events, plan);
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			...decision,
		});
		expect(await result).toMatchObject({ status: "error", approved: false });
	});

	it("handles a decision emitted before the start acknowledgement", async () => {
		const events = createEventBus();
		events.on("plannotator:request", (data) => {
			events.emit("plannotator:review-result", {
				reviewId: "review-1",
				approved: true,
				feedback: undefined,
				savedPath: undefined,
				agentSwitch: undefined,
				permissionMode: undefined,
			});
			(data as Request).respond(pending);
		});
		expect(await reviewPlan(events, plan)).toEqual({
			status: "approved",
			approved: true,
		});
	});

	it("isolates concurrent reviews and ignores unrelated or late decisions", async () => {
		const events = createEventBus();
		let index = 0;
		events.on("plannotator:request", (data) => {
			(data as Request).respond({
				status: "handled",
				result: { status: "pending", reviewId: `review-${++index}` },
			});
		});
		const first = reviewPlan(events, plan);
		const second = reviewPlan(events, plan);
		events.emit("plannotator:review-result", {
			reviewId: "unrelated",
			approved: true,
		});
		events.emit("plannotator:review-result", {
			reviewId: "review-2",
			approved: false,
		});
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			approved: true,
		});
		expect(await first).toEqual({ status: "approved", approved: true });
		expect(await second).toEqual({ status: "rejected", approved: false });
		events.emit("plannotator:review-result", {
			reviewId: "review-2",
			approved: true,
		});
		expect(await second).toEqual({ status: "rejected", approved: false });
	});

	it("removes its decision listener and abort handler on completion", async () => {
		const events = createEventBus();
		provider(events);
		const originalOn = events.on;
		const unsubscribe = vi.fn();
		vi.spyOn(events, "on").mockImplementation((channel, handler) => {
			const remove = originalOn(channel, handler);
			return () => {
				unsubscribe();
				remove();
			};
		});
		const abort = new AbortController();
		const remove = vi.spyOn(abort.signal, "removeEventListener");
		const result = reviewPlan(events, plan, abort.signal);
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			approved: true,
		});
		await result;
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	});

	it.each([
		{ planContent: "" },
		{ planContent: "  " },
		{ planContent: plan.planContent, planFilePath: " " },
	])("does not launch review for invalid input: %j", async (input) => {
		const events = createEventBus();
		const receive = provider(events);
		expect(await reviewPlan(events, input)).toMatchObject({
			status: "error",
			approved: false,
		});
		expect(receive).not.toHaveBeenCalled();
	});
});

describe("taskflow Extension", () => {
	it("registers the review tools with the required Plan input schema", async () => {
		const events = createEventBus();
		const receive = provider(events);
		const { tool, register } = registerTool(events);
		expect(register.mock.calls.map(([tool]) => tool.name)).toEqual([
			"taskflow_plan_review",
			"taskflow_code_review",
		]);
		expect(tool.name).toBe("taskflow_plan_review");
		expect(Check(tool.parameters, plan)).toBe(true);
		expect(Check(tool.parameters, { planContent: plan.planContent })).toBe(
			true,
		);
		expect(Check(tool.parameters, {})).toBe(false);
		expect(Check(tool.parameters, { planContent: 1 })).toBe(false);
		expect(Check(tool.parameters, { ...plan, planFilePath: 1 })).toBe(false);
		const result = tool.execute(
			"call-1",
			plan,
			undefined,
			undefined,
			{} as never,
		);
		events.emit("plannotator:review-result", {
			reviewId: "review-1",
			approved: false,
			feedback: "Revise the Plan.",
		});
		expect(await result).toMatchObject({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						status: "rejected",
						approved: false,
						feedback: "Revise the Plan.",
					}),
				},
			],
			details: {
				status: "rejected",
				approved: false,
				feedback: "Revise the Plan.",
			},
			isError: false,
		});
		expect(receive).toHaveBeenCalledTimes(1);
	});

	it("marks bridge failures as tool errors", async () => {
		const events = createEventBus();
		provider(events, { status: "error", error: "Review failed." });
		const { tool } = registerTool(events);
		expect(
			await tool.execute("call-1", plan, undefined, undefined, {} as never),
		).toMatchObject({
			isError: true,
			details: { approved: false, status: "error" },
		});
	});

	it("cancels a pending review when the Extension shuts down", async () => {
		const events = createEventBus();
		provider(events);
		const { tool, on } = registerTool(events);
		const result = tool.execute(
			"call-1",
			plan,
			undefined,
			undefined,
			{} as never,
		);
		expect(on.mock.calls[0][0]).toBe("session_shutdown");
		on.mock.calls[0][1]();
		expect(await result).toMatchObject({
			details: { status: "cancelled", approved: false },
		});
	});
});
