import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads the Implementation Skill through Pi and resolves all Implementation Playbooks", () => {
  const dir = fileURLToPath(
    new URL("../skills/taskflow-implementation/", import.meta.url),
  );
  const { skills, diagnostics } = loadSkillsFromDir({
    dir,
    source: "test",
  });

  expect(diagnostics).toEqual([]);
  expect(skills).toHaveLength(1);
  const skill = skills[0];
  expect(skill.name).toBe("taskflow-implementation");
  expect(skill.disableModelInvocation).toBe(true);
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
    expect(playbook.startsWith(`# ${title} Implementation Playbook\n`)).toBe(
      true,
    );
  }
});

it("resolves the bundled Planning Skill for replan guidance", () => {
  const dir = fileURLToPath(new URL("../skills/", import.meta.url));
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });
  expect(diagnostics).toEqual([]);
  const implementation = skills.find(
    (skill) => skill.name === "taskflow-implementation",
  );
  const planning = skills.find((skill) => skill.name === "taskflow-planning");
  expect(implementation).toBeDefined();
  expect(planning).toBeDefined();
  expect(planning!.disableModelInvocation).toBe(true);

  const links = [
    ...readFileSync(implementation!.filePath, "utf8").matchAll(
      /\]\(([^)]+\/taskflow-planning\/SKILL\.md)\)/g,
    ),
  ];
  expect(links).toHaveLength(1);
  expect(resolve(dirname(implementation!.filePath), links[0][1])).toBe(
    planning!.filePath,
  );
});
