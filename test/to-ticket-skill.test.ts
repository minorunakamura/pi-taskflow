import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads taskflow-to-ticket as an explicit Skill and resolves its bundled references and templates", () => {
  const dir = fileURLToPath(
    new URL("../skills/taskflow-to-ticket/", import.meta.url),
  );
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });

  expect(diagnostics).toEqual([]);
  expect(skills).toHaveLength(1);
  const skill = skills[0];
  expect(skill.name).toBe("taskflow-to-ticket");
  expect(skill.disableModelInvocation).toBe(true);
  expect(skill.description).toBeTruthy();

  const content = readFileSync(skill.filePath, "utf8");
  const references = [
    ...content.matchAll(/\]\((references\/[\w/-]+\.md|LICENSE)\)/g),
  ].map((match) => match[1]);
  expect([...new Set(references)]).toEqual([
    "references/templates/github.md",
    "references/templates/local.md",
    "references/templates/ticket.md",
    "references/origin.md",
    "LICENSE",
  ]);
  for (const reference of new Set(references)) {
    const path = join(skill.baseDir, reference);
    const text = readFileSync(path, "utf8");
    expect(text.trim()).not.toBe("");
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (!match[1].startsWith("https://")) {
        expect(
          readFileSync(join(dirname(path), match[1]), "utf8").trim(),
        ).not.toBe("");
      }
    }
  }
});

it("loads all three Taskflow Skills without name collisions from the package skills convention", () => {
  const dir = fileURLToPath(new URL("../skills/", import.meta.url));
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });

  expect(diagnostics).toEqual([]);
  expect(skills).toHaveLength(3);
  expect(skills.map((skill) => skill.name)).toEqual(
    expect.arrayContaining([
      "taskflow-implementation",
      "taskflow-planning",
      "taskflow-to-ticket",
    ]),
  );
});
