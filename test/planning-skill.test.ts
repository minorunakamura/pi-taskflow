import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
    expect(playbook.startsWith(`# ${title} Planning Playbook\n`)).toBe(true);
  }
});

it("resolves the bundled Implementation Skill for replan resume guidance", () => {
  const dir = fileURLToPath(new URL("../skills/", import.meta.url));
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });
  expect(diagnostics).toEqual([]);
  const planning = skills.find((skill) => skill.name === "taskflow-planning");
  const implementation = skills.find(
    (skill) => skill.name === "taskflow-implementation",
  );
  expect(planning).toBeDefined();
  expect(implementation).toBeDefined();
  expect(implementation!.disableModelInvocation).toBe(true);

  const links = [
    ...readFileSync(planning!.filePath, "utf8").matchAll(
      /\]\(([^)]+\/taskflow-implementation\/SKILL\.md)\)/g,
    ),
  ];
  expect(links).toHaveLength(1);
  expect(resolve(dirname(planning!.filePath), links[0][1])).toBe(
    implementation!.filePath,
  );
});

it("resolves the bundled ticket Skill from both Planning SKILL.md and its Feature Playbook", () => {
  const dir = fileURLToPath(new URL("../skills/", import.meta.url));
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: "test" });
  expect(diagnostics).toEqual([]);
  const planning = skills.find((skill) => skill.name === "taskflow-planning");
  const ticket = skills.find((skill) => skill.name === "taskflow-to-ticket");
  expect(planning).toBeDefined();
  expect(ticket).toBeDefined();
  expect(ticket!.disableModelInvocation).toBe(true);

  for (const source of [
    planning!.filePath,
    join(planning!.baseDir, "references/playbooks/feature.md"),
  ]) {
    const links = [
      ...readFileSync(source, "utf8").matchAll(
        /\]\(([^)]+\/taskflow-to-ticket\/SKILL\.md)\)/g,
      ),
    ];
    expect(links).toHaveLength(1);
    const target = resolve(dirname(source), links[0][1]);
    expect(target).toBe(ticket!.filePath);
  }
});
