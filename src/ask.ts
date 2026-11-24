import { randomUUID } from "node:crypto";
import type { EventBus } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

// pi-ask-user-question public contract (README "Public contract"); kept local to avoid a package dependency.
const REQUEST_EVENT = "pi-ask-user-question:request:v1";
const CANCEL_EVENT = "pi-ask-user-question:cancel:v1";
const replyEvent = (requestId: string) =>
  `pi-ask-user-question:reply:${requestId}`;

const AskOptionSchema = Type.Object({
  label: Type.String(),
  description: Type.Optional(Type.String()),
  preview: Type.Optional(Type.String()),
  value: Type.Optional(Type.String()),
});

const QuestionSchema = Type.Object({
  question: Type.String({
    description: "Short question only; put the premise in content.",
  }),
  header: Type.Optional(Type.String()),
  options: Type.Array(AskOptionSchema),
  multiSelect: Type.Optional(Type.Boolean()),
  allowOther: Type.Optional(Type.Boolean()),
});

export const AskParamsSchema = Type.Object({
  title: Type.Optional(Type.String()),
  content: Type.String({
    minLength: 1,
    pattern: "\\S",
    description:
      "Full Markdown shown before the questions: the text to approve or the premise of the question.",
  }),
  questions: Type.Array(QuestionSchema, { minItems: 1 }),
});

export type AskParams = Static<typeof AskParamsSchema>;

export type AskResult =
  | {
      status: "answered" | "user-cancelled" | "caller-aborted" | "shutdown";
      questions: unknown[];
      answers: Record<string, string | string[]>;
      selections: unknown[];
      cancelled: boolean;
      response?: string;
    }
  | { status: "failed"; error: { code: string; message: string } }
  | { status: "unavailable"; reason: string };

type Reply =
  | { success: true; result: AskResult }
  | { success: false; error?: { code: string; message: string } };

const stopped = (status: "caller-aborted" | "shutdown"): AskResult => ({
  status,
  questions: [],
  answers: {},
  selections: [],
  cancelled: true,
});

/**
 * Sends one questionnaire to pi-ask-user-question and waits for its reply.
 * `signal` (tool cancel) emits a cancel event; `shutdown` only stops waiting,
 * because pi-ask-user-question settles its own requests on session shutdown.
 */
export function askUserQuestion(
  events: EventBus,
  params: AskParams,
  signal: AbortSignal | undefined,
  shutdown: AbortSignal,
): Promise<AskResult> {
  if (signal?.aborted) return Promise.resolve(stopped("caller-aborted"));
  if (shutdown.aborted) return Promise.resolve(stopped("shutdown"));
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const finish = (result: AskResult) => {
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      shutdown.removeEventListener("abort", onShutdown);
      resolve(result);
    };
    const onAbort = () => {
      finish(stopped("caller-aborted"));
      events.emit(CANCEL_EVENT, { version: 1, requestId });
    };
    const onShutdown = () => finish(stopped("shutdown"));
    const unsubscribe = events.on(replyEvent(requestId), (data) => {
      const reply = data as Reply | undefined;
      finish(
        reply?.success === true
          ? reply.result
          : {
              status: "failed",
              error: reply?.error ?? {
                code: "internal-error",
                message: "Malformed pi-ask-user-question reply.",
              },
            },
      );
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    shutdown.addEventListener("abort", onShutdown, { once: true });
    events.emit(REQUEST_EVENT, {
      version: 1,
      requestId,
      ...(params.title !== undefined && { title: params.title }),
      questions: params.questions,
    });
  });
}

/** Escapes terminal control characters (Cc/Cf/Zl/Zp) except newline and tab. */
export function visible(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) =>
    character === "\n" || character === "\t"
      ? character
      : `\\u{${character.codePointAt(0)?.toString(16)}}`,
  );
}

/** Markdown for the tool call row; args may be partial while streaming. */
export function askMarkdown(args: Partial<AskParams> | undefined): string {
  const title = typeof args?.title === "string" ? args.title.trim() : "";
  const content = typeof args?.content === "string" ? args.content : "";
  return visible(title ? `## ${title}\n\n${content}` : content);
}

/** One-line-per-answer summary for the tool result row. */
export function askSummary(result: AskResult | undefined): string {
  if (!result) return "";
  if (result.status === "unavailable")
    return visible(`unavailable: ${result.reason}`);
  if (result.status === "failed")
    return visible(`failed: ${result.error.code}: ${result.error.message}`);
  if (result.status !== "answered")
    return visible(`${result.status} (cancelled, not answered)`);
  return visible(
    Object.entries(result.answers)
      .map(
        ([question, answer]) =>
          `${question} → ${Array.isArray(answer) ? answer.join(", ") : answer}`,
      )
      .join("\n"),
  );
}
