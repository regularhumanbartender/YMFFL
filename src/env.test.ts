// The public snapshot site intentionally does not use the template's OAuth env.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
test("public package installs without private Foundry SDK dependencies", () => {
  const manifest = JSON.parse(read("../website/package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(
    Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
      (name) => name.startsWith("@osdk/") || name.startsWith("@ymffl-website/"),
    ),
  ).toEqual([]);
});
test("public HTML does not configure browser OAuth", () => {
  expect(read("../website/index.html")).not.toContain("osdk-clientId");
  expect(read("../index.html")).not.toContain("osdk-clientId");
});
test("website modules never import Foundry clients", () => {
  for (const path of [
    "../website/src/main.tsx",
    "../website/src/App.tsx",
    "../website/src/model.ts",
  ]) {
    expect(read(path)).not.toMatch(/@osdk\/|@ymffl-website\/sdk|from ["'](?:\.{1,2}\/|@\/).*client["']/);
  }
});
