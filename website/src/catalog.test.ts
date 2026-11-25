import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cycleLabel,
  cycleMetadata,
  loadCatalog,
  loadCycle,
  manifestSchema,
  validateCycleSnapshot,
} from "./catalog";
import next from "./demo-2027.fixture.json";
import old from "./demo.fixture.json";
import { emptyScenario, readScenario, scenarioKey, snapshotSchema } from "./model";

const s = snapshotSchema.parse(old);
const n = snapshotSchema.parse(next);
const cycle = { ...cycleMetadata(s), file: "demo-2026.0123456789abcdef0123.json" };
const newer = { ...cycleMetadata(n), file: "demo-2027.0123456789abcdef0123.json" };
const manifest = { schemaVersion: 1, defaultLeagueId: n.league.leagueId, cycles: [newer, cycle] };
afterEach(() => vi.unstubAllGlobals());

describe("keeper cycle catalog", () => {
  it("labels stats year and keeper year without relabeling existing 2026 data", () => {
    expect(cycleLabel(2026)).toBe("2025–26");
    expect(cycleMetadata(n)).toMatchObject({
      label: "2026–27",
      keeperYear: 2027,
      statsYear: 2026,
      source: "demo",
    });
    expect(manifestSchema.parse(manifest).defaultLeagueId).toBe("demo-2027");
    expect(validateCycleSnapshot(n, newer)).toEqual(n);
    expect(() => snapshotSchema.parse({ ...old, league: { ...old.league, season: 2027 } })).toThrow(
      /keeper year disagree/,
    );
  });
  it.each([
    { ...manifest, defaultLeagueId: "missing" },
    { ...manifest, defaultLeagueId: cycle.leagueId },
    { ...manifest, cycles: [newer, newer] },
    { ...manifest, cycles: [{ ...newer, statsYear: 2025 }] },
    { ...manifest, cycles: [{ ...newer, label: "2027" }] },
    { ...manifest, cycles: [{ ...newer, file: "https://example.test/data.json" }] },
    { ...manifest, cycles: [{ ...newer, file: "../snapshot.json" }] },
    { ...manifest, cycles: [{ ...newer, file: cycle.file }] },
  ])("rejects malformed catalog metadata, paths, defaults and duplicate IDs", (raw) => {
    expect(() => manifestSchema.parse(raw)).toThrow();
  });
  it("rejects a valid snapshot served under the wrong cycle or baseline", () => {
    expect(() => validateCycleSnapshot(s, newer)).toThrow(/does not match/);
    expect(() => validateCycleSnapshot(s, { ...cycle, snapshotId: "new" })).toThrow();
    expect(() => validateCycleSnapshot(s, { ...cycle, source: "foundry" })).toThrow();
  });
  it("loads the manifest and selected snapshot relative to a GitHub Pages base", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(next));
    vi.stubGlobal("fetch", fetcher);
    const catalog = await loadCatalog("/YMFFL/");
    expect(catalog.defaultLeagueId).toBe("demo-2027");
    expect(await loadCycle("/YMFFL/", catalog.cycles[0])).toEqual(n);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/YMFFL/data/manifest.json",
      `/YMFFL/data/${newer.file}`,
    ]);
  });
  it("supports a missing manifest as a read-only singleton derived from snapshot.league.season", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json(next));
    vi.stubGlobal("fetch", fetcher);
    const catalog = await loadCatalog("/YMFFL/");
    expect(catalog.cycles).toHaveLength(1);
    expect(catalog.cycles[0]).toMatchObject({
      leagueId: "demo-2027",
      label: "2026–27",
      keeperYear: 2027,
      statsYear: 2026,
    });
    expect(await loadCycle("/YMFFL/", catalog.cycles[0])).toEqual(n);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed instead of hiding a broken manifest behind the latest alias", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...manifest, schemaVersion: 2 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadCatalog("/YMFFL/")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("cycle-specific scenario boundaries", () => {
  it("isolates scenarios even when IDs and player IDs collide across years", () => {
    const sameId = { ...n, snapshotId: s.snapshotId };
    const scenario = { keepers: { [s.players[0].playerId]: false }, trades: [] };
    const storage = new Map([
      [
        scenarioKey(s),
        JSON.stringify({
          version: 2,
          leagueId: s.league.leagueId,
          snapshotId: s.snapshotId,
          ...scenario,
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null });
    expect(scenarioKey(s)).not.toBe(scenarioKey(sameId));
    expect(readScenario(s)).toEqual(scenario);
    expect(readScenario(sameId)).toEqual(emptyScenario());
    expect(readScenario({ ...s, snapshotId: "changed-baseline" })).toEqual(emptyScenario());
  });
  it("can read the original exact 2026 key but never migrates it to 2027", () => {
    const scenario = { keepers: { [s.players[0].playerId]: false }, trades: [] };
    const getItem = vi.fn((key: string) =>
      key === `ymffl:scenario:${s.snapshotId}` ? JSON.stringify(scenario) : null,
    );
    vi.stubGlobal("localStorage", { getItem });
    expect(readScenario(s)).toEqual(scenario);
    getItem.mockClear();
    expect(readScenario({ ...n, snapshotId: s.snapshotId })).toEqual(emptyScenario());
    expect(getItem).toHaveBeenCalledTimes(2);
  });
});
