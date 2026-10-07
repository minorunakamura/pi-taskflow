import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads the Planning Skill through Pi and resolves its Feature Playbook", () => {
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
	const reference = content.match(/\]\((references\/playbooks\/feature\.md)\)/);
	expect(reference).not.toBeNull();
	const playbook = readFileSync(join(skill.baseDir, reference![1]), "utf8");
	expect(playbook.startsWith("# Feature Planning Playbook\n")).toBe(true);
});
