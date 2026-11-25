import { afterEach, describe, expect, it, vi } from "vitest";
import { cycleMetadata, manifestSchema } from "./catalog";
import nextFixture from "./demo-2027.fixture.json";
import fixture from "./demo.fixture.json";
import {
  emptyScenario,
  legacyScenarioKey,
  loadScenario,
  playerSchema,
  scenarioKey,
  scenarioTradeSchema,
  snapshotSchema,
} from "./model";

const snapshot = () => snapshotSchema.parse(structuredClone(fixture));
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

describe("Zod 4 validation compatibility", () => {
  it.each([fixture, nextFixture])("keeps schema-v1 snapshot JSON compatible in both cycles", (raw) => {
    const parsed = snapshotSchema.parse(raw);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.rulesVersion).toBe("ymffl-2026-v1");
    expect(snapshotSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it.each([
    { positionRank: "1" },
    { positionRank: -1 },
    { positionRank: 1.5 },
    { auctionValue: "20" },
    { auctionValue: Number.MAX_SAFE_INTEGER + 1 },
    { keeperCost: Infinity },
    { keeperCost: NaN },
    { keeperEligible: "true" },
    { underContract: 1 },
  ])("does not coerce or accept invalid player fields: %j", (invalid) => {
    expect(playerSchema.safeParse({ ...fixture.players[0], ...invalid }).success).toBe(false);
  });

  it("retains optional absent rank and strips non-public fields", () => {
    const raw: Record<string, unknown> = { ...fixture.players[0], privateNote: "not public" };
    delete raw.positionRank;
    const parsed = playerSchema.parse(raw);
    expect(parsed).not.toHaveProperty("positionRank");
    expect(parsed).not.toHaveProperty("privateNote");
  });

  it("rejects oversized constrained snapshot and catalog collections", () => {
    const s = snapshot();
    const oversized = snapshotSchema.safeParse({ ...s, players: Array(1001).fill(s.players[0]) });
    expect(oversized.success).toBe(false);
    if (!oversized.success) {
      expect(oversized.error.issues).toContainEqual(
        expect.objectContaining({ code: "too_big", path: ["players"] }),
      );
    }
    const cycle = { ...cycleMetadata(s), file: "demo-2026.0123456789abcdef0123.json" };
    expect(
      manifestSchema.safeParse({
        schemaVersion: 1,
        defaultLeagueId: s.league.leagueId,
        cycles: Array(101).fill(cycle),
      }).success,
    ).toBe(false);
  });

  it("retains strict local-trade fields and collection limits", () => {
    const trade = {
      id: "local",
      fromTeamId: "team-0",
      toTeamId: "team-1",
      fromPlayerIds: [],
      toPlayerIds: [],
      amount: 1,
      cashDirection: "fromTo",
    };
    expect(scenarioTradeSchema.safeParse(trade).success).toBe(true);
    expect(scenarioTradeSchema.safeParse({ ...trade, extra: true }).success).toBe(false);
    expect(
      scenarioTradeSchema.safeParse({ ...trade, fromPlayerIds: Array(1001).fill("demo-0-0") })
        .success,
    ).toBe(false);
  });

  it("reads an existing v2 boolean keeper record without rewriting or migrating it", () => {
    const data = storage();
    const s = snapshot();
    const scenario = { keepers: { [s.players[0].playerId]: false }, trades: [] };
    const raw = JSON.stringify({
      version: 2,
      leagueId: s.league.leagueId,
      snapshotId: s.snapshotId,
      ...scenario,
    });
    data.set(scenarioKey(s), raw);
    expect(loadScenario(s)).toEqual({ scenario, notice: "" });
    expect(data.get(scenarioKey(s))).toBe(raw);
    expect(data.size).toBe(1);
  });

  it.each([null, [], "false", { "demo-0-0": "false" }, { "demo-0-0": 0 }])(
    "fails malformed keeper records closed without coercion, fallback or storage edits: %j",
    (keepers) => {
      const data = storage();
      const s = snapshot();
      const raw = JSON.stringify({
        version: 2,
        leagueId: s.league.leagueId,
        snapshotId: s.snapshotId,
        keepers,
        trades: [],
      });
      data.set(scenarioKey(s), raw);
      data.set(
        legacyScenarioKey(s),
        JSON.stringify({ keepers: { [s.players[0].playerId]: false }, trades: [] }),
      );
      const before = new Map(data);
      const loaded = loadScenario(s);
      expect(loaded.scenario).toEqual(emptyScenario());
      expect(loaded.notice).toMatch(/invalid/);
      expect(data).toEqual(before);
    },
  );
});
