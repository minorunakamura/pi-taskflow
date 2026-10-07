import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";

it("loads the Implementation Skill through Pi and resolves the Feature Playbook", () => {
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
	expect(skill.disableModelInvocation).toBe(false);
	expect(skill.description).toBeTruthy();

	const content = readFileSync(skill.filePath, "utf8");
	const references = [
		...content.matchAll(/\]\((references\/playbooks\/[\w-]+\.md)\)/g),
	].map((match) => match[1]);
	expect(references).toEqual(["references/playbooks/feature.md"]);
	const playbook = readFileSync(join(skill.baseDir, references[0]), "utf8");
	expect(playbook.startsWith("# Feature Implementation Playbook\n")).toBe(true);
});
