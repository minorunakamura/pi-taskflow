import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEventBus,
  loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import verification from "../skills/taskflow-verification/scripts/code-review.ts";
import { registerTaskflow } from "./helpers.ts";

it("loads the Code Review verification Skill and resolves its bundled assets", () => {
  const dir = fileURLToPath(
    new URL("../skills/taskflow-verification/", import.meta.url),
  );
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });
  expect(diagnostics).toEqual([]);
  expect(skills).toHaveLength(1);
  expect(skills[0]).toMatchObject({
    name: "taskflow-verification",
    disableModelInvocation: false,
  });
  expect(
    readFileSync(join(dir, "references/feature-map.md"), "utf8"),
  ).toContain("Code Review");
  expect(readFileSync(join(dir, "scripts/code-review.ts"), "utf8")).toContain(
    "../../../extensions/taskflow.ts",
  );
});

it("connects the verification command to the real disabled tool through Pi's loader", async () => {
  const evidence = mkdtempSync(join(tmpdir(), "taskflow-verification-test-"));
  vi.stubEnv("TASKFLOW_EVIDENCE_DIR", evidence);
  try {
    const harness = await registerTaskflow(
      createEventBus(),
      process.cwd(),
      false,
      verification,
    );
    const command = harness.commands.mock.calls.find(
      ([name]) => name === "verify-code-review",
    )![1];
    await command.handler("", harness.commandContext);
    await vi.waitFor(() => {
      const events = readFileSync(join(evidence, "tool-events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "tool-start",
        cwd: process.cwd(),
      });
      expect(events[1]).toMatchObject({
        type: "tool-end",
        result: {
          details: { status: "skipped", approved: false },
          isError: false,
        },
      });
    });
    await harness.shutdown();
    expect(readFileSync(join(evidence, "tool-events.jsonl"), "utf8")).toContain(
      '"type":"shutdown"',
    );
  } finally {
    vi.unstubAllEnvs();
    rmSync(evidence, { recursive: true, force: true });
  }
});
