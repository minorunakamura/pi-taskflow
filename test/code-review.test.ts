import {
	createEventBus,
	type EventBus,
	type ExtensionAPI,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import taskflow from "../extensions/taskflow.ts";
import { reviewCode } from "../src/plannotator.ts";

type Request = {
	requestId: string;
	action: string;
	payload: { cwd?: string; reviewId?: string };
	respond: (response: unknown) => void;
};
const handled = (result: unknown) => ({ status: "handled", result });
const cwd = "/project";

function provider(events: EventBus, response?: unknown) {
	const receive = vi.fn((data: unknown) => {
		const request = data as Request;
		if (request.action === "review-status") {
			request.respond(handled({ status: "missing" }));
		} else if (response !== undefined) {
			request.respond(response);
		}
	});
	events.on("plannotator:request", receive);
	return receive;
}

function registerTool(events: EventBus, value?: unknown) {
	const settingsManager = SettingsManager.inMemory({
		...(value !== undefined && { taskflow: { plannotatorCodeReview: value } }),
	} as ReturnType<ExtensionAPI["getSettings"]>);
	const getSettings = vi.fn(() => settingsManager.getSettings());
	const register = vi.fn<ExtensionAPI["registerTool"]>();
	const on = vi.fn();
	taskflow({
		events,
		registerTool: register,
		getSettings,
		on,
	} as unknown as ExtensionAPI);
	const tool = register.mock.calls.find(
		([tool]) => tool.name === "taskflow_code_review",
	)![0];
	return {
		execute: (signal?: AbortSignal) =>
			tool.execute("call-1", {}, signal, undefined, { cwd } as never),
		getSettings,
		settingsManager,
		on,
	};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	expect(vi.getTimerCount()).toBe(0);
	vi.useRealTimers();
});

describe("Plannotator Code Review", () => {
	it.each([true, false])(
		"returns an explicit decision (approved: %s)",
		async (approved) => {
			const events = createEventBus();
			const receive = provider(
				events,
				handled({
					approved,
					feedback: "Review notes.",
					annotations: [],
					agentSwitch: undefined,
				}),
			);
			expect(await reviewCode(events, cwd)).toEqual({
				status: approved ? "approved" : "rejected",
				approved,
				feedback: "Review notes.",
			});
			expect(receive).toHaveBeenCalledTimes(2);
			const probe = receive.mock.calls[0][0] as Request;
			const request = receive.mock.calls[1][0] as Request;
			expect(probe.action).toBe("review-status");
			expect(probe.payload.reviewId).toMatch(/^[0-9a-f-]{36}$/);
			expect(request).toMatchObject({
				action: "code-review",
				payload: { cwd },
			});
			expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
		},
	);

	it("does not time out a human review or approve from a Plan decision event", async () => {
		const events = createEventBus();
		const receive = provider(events);
		const settled = vi.fn();
		const result = reviewCode(events, cwd).then(settled);
		events.emit("plannotator:review-result", {
			reviewId: "plan-1",
			approved: true,
		});
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(settled).not.toHaveBeenCalled();
		(receive.mock.calls[1][0] as Request).respond(handled({ approved: true }));
		await result;
		expect(settled).toHaveBeenCalledWith({
			status: "approved",
			approved: true,
		});
	});

	it.each([true, false])(
		"browser exit never counts as approval (approved: %s)",
		async (approved) => {
			const events = createEventBus();
			provider(events, handled({ approved, exit: true }));
			expect(await reviewCode(events, cwd)).toEqual({
				status: "cancelled",
				approved: false,
			});
		},
	);

	it.each(["probe", "review", "already-aborted"])(
		"cancels while %s and ignores late approval",
		async (phase) => {
			const events = createEventBus();
			const requests: Request[] = [];
			events.on("plannotator:request", (data) => {
				const request = data as Request;
				requests.push(request);
				if (phase === "review" && request.action === "review-status") {
					request.respond(handled({ status: "missing" }));
				}
			});
			const abort = new AbortController();
			if (phase === "already-aborted") abort.abort();
			const result = reviewCode(events, cwd, abort.signal);
			abort.abort();
			for (const request of requests) {
				request.respond(
					handled(
						request.action === "review-status"
							? { status: "missing" }
							: { approved: true },
					),
				);
			}
			expect(await result).toEqual({ status: "cancelled", approved: false });
			expect(requests).toHaveLength(
				phase === "already-aborted" ? 0 : phase === "probe" ? 1 : 2,
			);
		},
	);

	it("reports an absent provider without launching a review", async () => {
		const result = reviewCode(createEventBus(), cwd);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await result).toMatchObject({
			status: "unavailable",
			approved: false,
		});
	});

	it.each(["review-status", "code-review"])(
		"returns provider errors during %s",
		async (action) => {
			for (const status of ["error", "unavailable"]) {
				const events = createEventBus();
				events.on("plannotator:request", (data) => {
					const request = data as Request;
					request.respond(
						request.action === action
							? { status, error: "Browser failed." }
							: handled({ status: "missing" }),
					);
				});
				expect(await reviewCode(events, cwd)).toEqual({
					status,
					approved: false,
					error: "Browser failed.",
				});
			}
		},
	);

	it.each([
		null,
		[],
		{ approved: true },
		handled({}),
		handled({ approved: "true" }),
		handled({ approved: true, feedback: {} }),
		handled({ approved: true, annotations: {} }),
		handled({ approved: true, agentSwitch: 1 }),
		handled({ approved: true, exit: "true" }),
		handled({ approved: true, status: "cancelled" }),
		{ status: "error", error: true },
	])("fails safely for invalid decisions: %j", async (response) => {
		const events = createEventBus();
		provider(events, response);
		expect(await reviewCode(events, cwd)).toMatchObject({
			status: "error",
			approved: false,
		});
	});

	it("rejects an invalid availability response without opening Code Review", async () => {
		const events = createEventBus();
		const receive = vi.fn((data: unknown) =>
			(data as Request).respond(handled({ approved: true })),
		);
		events.on("plannotator:request", receive);
		expect(await reviewCode(events, cwd)).toMatchObject({
			status: "error",
			approved: false,
		});
		expect(receive).toHaveBeenCalledTimes(1);
	});

	it("fails safely if emitting the request throws", async () => {
		const events = createEventBus();
		vi.spyOn(events, "emit").mockImplementation(() => {
			throw new Error("Event bus failure.");
		});
		expect(await reviewCode(events, cwd)).toEqual({
			status: "error",
			approved: false,
			error: "Event bus failure.",
		});
	});
});

describe("taskflow_code_review tool", () => {
	it.each([undefined, false])(
		"reads settings internally and skips when disabled: %s",
		async (value) => {
			const events = createEventBus();
			const receive = provider(events);
			const { execute, getSettings } = registerTool(events, value);
			expect(await execute()).toEqual({
				content: [
					{
						type: "text",
						text: JSON.stringify({ status: "skipped", approved: false }),
					},
				],
				details: { status: "skipped", approved: false },
				isError: false,
			});
			expect(getSettings).toHaveBeenCalledTimes(1);
			expect(receive).not.toHaveBeenCalled();
		},
	);

	it.each([true, false])(
		"returns enabled Code Review decision and feedback: %s",
		async (approved) => {
			const events = createEventBus();
			provider(
				events,
				handled({ approved, feedback: "Root decides what to change." }),
			);
			const { execute } = registerTool(events, true);
			const decision = {
				status: approved ? "approved" : "rejected",
				approved,
				feedback: "Root decides what to change.",
			};
			expect(await execute()).toEqual({
				content: [{ type: "text", text: JSON.stringify(decision) }],
				details: decision,
				isError: false,
			});
		},
	);

	it("resolves the current effective settings on every invocation", async () => {
		const events = createEventBus();
		const receive = provider(events, handled({ approved: true }));
		const { execute, settingsManager } = registerTool(events, false);
		expect(await execute()).toMatchObject({ details: { status: "skipped" } });
		settingsManager.applyOverrides({
			taskflow: { plannotatorCodeReview: true },
		} as ReturnType<ExtensionAPI["getSettings"]>);
		expect(await execute()).toMatchObject({ details: { status: "approved" } });
		expect(receive).toHaveBeenCalledTimes(2);
	});

	it("reports invalid configuration clearly without opening Plannotator", async () => {
		const events = createEventBus();
		const receive = provider(events);
		const { execute } = registerTool(events, "true");
		await expect(execute()).rejects.toThrow(
			"Invalid taskflow.plannotatorCodeReview setting: expected a boolean.",
		);
		expect(receive).not.toHaveBeenCalled();
	});

	it("marks failures as tool errors", async () => {
		const events = createEventBus();
		provider(events, { status: "error", error: "Review failed." });
		const { execute } = registerTool(events, true);
		expect(await execute()).toMatchObject({
			isError: true,
			details: { status: "error", approved: false },
		});
	});

	it("cancels pending Code Review on Extension shutdown", async () => {
		const events = createEventBus();
		provider(events);
		const { execute, on } = registerTool(events, true);
		const result = execute();
		on.mock.calls.find(([event]) => event === "session_shutdown")![1]();
		expect(await result).toMatchObject({
			details: { status: "cancelled", approved: false },
		});
	});
});
