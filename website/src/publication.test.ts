import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { manifestSchema, validateCycleSnapshot } from "./catalog";
import { snapshotSchema } from "./model";

const data = new URL("../public/data/", import.meta.url);
const read = (file: string): unknown => JSON.parse(readFileSync(new URL(file, data), "utf8"));
it("the actual static publication is valid, with either a complete catalog or the legacy singleton", () => {
  const alias = snapshotSchema.parse(read("snapshot.json"));
  if (!existsSync(new URL("manifest.json", data))) {
    expect(alias.league.season).toBeGreaterThanOrEqual(2000);
    return;
  }
  const manifest = manifestSchema.parse(read("manifest.json"));
  for (const cycle of manifest.cycles) {
    const snapshot = validateCycleSnapshot(read(cycle.file), cycle);
    if (cycle.leagueId === manifest.defaultLeagueId) {
      expect(alias).toEqual(snapshot);
    }
  }
  // This fixture is for mocked tests only, never a production cycle.
  expect(manifest.cycles.some((c) => c.leagueId === "demo-2027")).toBe(false);
});
