import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import checkedManifest from "../website/public/data/manifest.json";
import { manifestSchema, validateCycleSnapshot } from "../website/src/catalog";
import next from "../website/src/demo-2027.fixture.json";
import old from "../website/src/demo.fixture.json";
import { type Snapshot, snapshotSchema } from "../website/src/model";
import { buildSnapshot, publishSnapshots, selectionFromEnv } from "./publish-snapshots";

const older = () =>
  snapshotSchema.parse({
    ...old,
    source: "foundry",
    league: { ...old.league, leagueId: "ymffl-2026" },
  });
const newer = () =>
  snapshotSchema.parse({
    ...next,
    source: "foundry",
    league: { ...next.league, leagueId: "ymffl-2027" },
  });
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ymffl-publish-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const read = (file: string) => readFile(join(directory, file), "utf8");
const dump = async () =>
  Promise.all((await readdir(directory)).sort().map(async (file) => [file, await read(file)]));

describe("multi-cycle publication", () => {
  it("defaults to all without a hardcoded 2026 selection", () => {
    expect(selectionFromEnv()).toBe("all");
    expect(selectionFromEnv("")).toBe("all");
    expect(selectionFromEnv("ymffl-2027")).toBe("ymffl-2027");
    expect(() => selectionFromEnv("2027")).toThrow();
  });
  it("writes immutable snapshots, a latest alias and a consistent newest-default manifest", async () => {
    const m = await publishSnapshots([older(), newer()], { directory });
    expect(m.defaultLeagueId).toBe("ymffl-2027");
    expect(m.cycles.map((c) => [c.label, c.statsYear])).toEqual([
      ["2026–27", 2026],
      ["2025–26", 2025],
    ]);
    for (const c of m.cycles) {
      expect(validateCycleSnapshot(JSON.parse(await read(c.file)), c).league.leagueId).toBe(
        c.leagueId,
      );
    }
    expect(JSON.parse(await read("snapshot.json"))).toEqual(newer());
    expect(JSON.parse(await read("manifest.json"))).toEqual(m);
  });
  it("validates ALL cycles before touching the previous publication", async () => {
    await publishSnapshots([older()], { directory });
    const before = await dump();
    const bad = newer();
    bad.teams[0].remainingBudget++;
    await expect(publishSnapshots([older(), bad], { directory })).rejects.toThrow();
    expect(await dump()).toEqual(before);
  });
  it("retains unselected cycles, does not make an older refresh the default, and retains immutable history", async () => {
    const m = await publishSnapshots([older(), newer()], { directory });
    const changed = older();
    changed.capturedAt = "2026-11-25T00:00:00Z";
    const after = await publishSnapshots([changed], { directory, selection: "ymffl-2026" });
    expect(after.defaultLeagueId).toBe("ymffl-2027");
    expect(after.cycles[0]).toEqual(m.cycles[0]);
    expect(after.cycles[1].file).not.toBe(m.cycles[1].file);
    expect(after.cycles[1].snapshotId).toBe(m.cycles[1].snapshotId);
    expect(JSON.parse(await read(m.cycles[1].file))).toEqual(older());
    expect(JSON.parse(await read("snapshot.json"))).toEqual(newer());
  });
  it("can bootstrap selected export from an existing single-file publication", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(directory, "snapshot.json"), JSON.stringify(older()));
    const m = await publishSnapshots([newer()], { directory, selection: "ymffl-2027" });
    expect(m.cycles.map((c) => c.leagueId)).toEqual(["ymffl-2027", "ymffl-2026"]);
  });
  it("replaces an illustrative cycle when actual data for the same keeper year arrives", async () => {
    await publishSnapshots([old], { directory });
    const m = await publishSnapshots([older()], { directory, selection: "ymffl-2026" });
    expect(m.cycles).toHaveLength(1);
    expect(m.cycles[0].source).toBe("foundry");
  });
  it("never overwrites a valid manifest when a retained cycle is broken", async () => {
    const m = await publishSnapshots([older()], { directory });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(directory, m.cycles[0].file), "{}");
    const before = await dump();
    await expect(
      publishSnapshots([newer()], { directory, selection: "ymffl-2027" }),
    ).rejects.toThrow();
    expect(await dump()).toEqual(before);
  });
  it("hashes normalized content independently per league and never silently changes baseline IDs", () => {
    const payload = ({ league, players, teams, trades }: Snapshot) => ({
      league,
      players,
      teams,
      trades,
    });
    const a = buildSnapshot(payload(older()), "2026-11-24T00:00:00Z");
    const b = buildSnapshot(payload(older()), "2026-11-25T00:00:00Z");
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(buildSnapshot(payload(newer()), a.capturedAt).snapshotId).not.toBe(a.snapshotId);
  });
  it("every checked-in cycle matches its file, and the fictional 2027 test fixture is never published", async () => {
    const m = manifestSchema.parse(checkedManifest);
    expect(m.cycles.some((c) => c.leagueId === "demo-2027")).toBe(false);
    for (const c of m.cycles) {
      const raw = JSON.parse(await readFile(join("website/public/data", c.file), "utf8"));
      expect(validateCycleSnapshot(raw, c).league.season).toBe(c.keeperYear);
    }
    const alias = snapshotSchema.parse(
      JSON.parse(await readFile("website/public/data/snapshot.json", "utf8")),
    );
    expect(alias.league.leagueId).toBe(m.defaultLeagueId);
    expect(alias.snapshotId).toBe(
      m.cycles.find((c) => c.leagueId === m.defaultLeagueId)!.snapshotId,
    );
  });
});
