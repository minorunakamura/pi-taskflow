import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads the Planning Skill through Pi and resolves all Planning Playbooks", () => {
  const dir = fileURLToPath(
    new URL("../skills/taskflow-planning/", import.meta.url),
  );
  const { skills, diagnostics } = loadSkillsFromDir({
    dir,
    source: "test",
  });

  expect(diagnostics).toEqual([]);
  expect(skills).toHaveLength(1);
  const skill = skills[0];
  expect(skill.name).toBe("taskflow-planning");
  expect(skill.disableModelInvocation).toBe(false);
  expect(skill.description).toBeTruthy();

  const content = readFileSync(skill.filePath, "utf8");
  const references = [
    ...content.matchAll(/\]\((references\/playbooks\/[\w-]+\.md)\)/g),
  ].map((match) => match[1]);
  expect(references).toEqual([
    "references/playbooks/feature.md",
    "references/playbooks/bug-fix.md",
    "references/playbooks/refactoring.md",
    "references/playbooks/performance.md",
  ]);
  for (const [index, title] of [
    "Feature",
    "Bug Fix",
    "Refactoring",
    "Performance",
  ].entries()) {
    const playbook = readFileSync(
      join(skill.baseDir, references[index]),
      "utf8",
    );
    expect(playbook.startsWith(`# ${title} Planning Playbook\n`)).toBe(true);
  }
});
