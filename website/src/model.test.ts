import { describe, expect, it, vi } from "vitest";
import published from "../public/data/snapshot.json";
import fixture from "./demo.fixture.json";
import {
  type Player,
  addTrade,
  budgets,
  emptyScenario,
  keeperCost,
  readScenario,
  snapshotSchema,
} from "./model";

const snapshot = () => snapshotSchema.parse(structuredClone(fixture));
const sample = (fields: Partial<Player> = {}): Player => ({
  ...snapshot().players[0],
  underContract: false,
  overrideEnabled: false,
  ...fields,
});

describe("pricing parity with Foundry league functions", () => {
  it("does not treat expired zero-cost players as free keepers", () => {
    expect(keeperCost(sample({ keeperEligible: false }), snapshot().league)).toBe(0);
  });
  it("applies manual override before contract lock", () => {
    expect(
      keeperCost(
        sample({ overrideEnabled: true, overrideValue: 7, underContract: true }),
        snapshot().league,
      ),
    ).toBe(7);
  });
  it("retains an eligible contract-locked auction price", () => {
    expect(keeperCost(sample({ underContract: true, auctionValue: 3 }), snapshot().league)).toBe(3);
  });
  it("uses elite premium floor", () => {
    expect(
      keeperCost(sample({ position: "QB", positionRank: 1, auctionValue: 20 }), snapshot().league),
    ).toBe(30);
  });
  it("uses percentage when it exceeds floors", () => {
    expect(
      keeperCost(sample({ position: "RB", positionRank: 1, auctionValue: 100 }), snapshot().league),
    ).toBe(120);
  });
  it("uses standard minimum", () => {
    expect(
      keeperCost(sample({ position: "WR", positionRank: 99, auctionValue: 1 }), snapshot().league),
    ).toBe(10);
  });
  it("does not make unranked or zero-rank players elite", () => {
    expect(
      keeperCost(sample({ position: "QB", positionRank: 0, auctionValue: 20 }), snapshot().league),
    ).toBe(22);
    expect(
      keeperCost(sample({ positionRank: undefined, auctionValue: 20 }), snapshot().league),
    ).toBe(22);
  });
  it("disables elite status when cutoff is zero", () => {
    expect(
      keeperCost(sample({ positionRank: 1, auctionValue: 20 }), {
        ...snapshot().league,
        qbEliteRank: 0,
      }),
    ).toBe(22);
  });
  it("prices other positions with defense rules", () => {
    expect(keeperCost(sample({ position: "K", auctionValue: 3 }), snapshot().league)).toBe(5);
  });
  it("rounds offense to the nearest dollar", () => {
    expect(
      keeperCost(sample({ position: "WR", positionRank: 99, auctionValue: 15 }), snapshot().league),
    ).toBe(17);
  });
});
describe("scenario accounting", () => {
  it("matches the published baseline", () => {
    const s = snapshot();
    for (const t of budgets(s, emptyScenario())) {
      expect(t.remaining).toBe(t.remainingBudget);
      expect(t.spend).toBe(t.keeperSpend);
    }
  });
  it("a local keeper change alters only that team's budget without mutating source", () => {
    const s = snapshot();
    const p = s.players[0];
    const baseline = s.teams[0].remainingBudget;
    const totals = budgets(s, { keepers: { [p.playerId]: false }, trades: [] });
    expect(totals[0].remaining).toBe(baseline + p.keeperCost);
    expect(s.players[0].isKeeper).toBe(true);
    expect(totals[1].remaining).toBe(s.teams[1].remainingBudget);
  });
  it("reserves minimum bids for all other open spots", () => {
    const s = snapshot();
    const t = budgets(s, emptyScenario())[0];
    expect(t.maxBid).toBe(Math.max(0, t.remaining - (t.open - 1) * s.league.minimumBid));
  });
  it("flags underfunded scenarios instead of hiding deficits", () => {
    const s = snapshot();
    s.league.baseBudget = 0;
    expect(budgets(s, emptyScenario())[0].status).toBe("Underfunded");
  });
  it("has no maximum bid when roster is full", () => {
    const s = snapshot();
    s.league.rosterSize = 3;
    expect(budgets(s, emptyScenario())[0].maxBid).toBe(0);
  });
  it("flags overfilled rosters", () => {
    const s = snapshot();
    s.league.rosterSize = 2;
    expect(budgets(s, emptyScenario())[0].status).toBe("Over roster limit");
  });
  it("does not double count recorded trades", () => {
    const s = snapshot();
    s.trades.push({
      tradeId: "recorded",
      fromTeamId: s.teams[0].teamId,
      toTeamId: s.teams[1].teamId,
      amount: 50,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(budgets(s, emptyScenario())[0].remaining).toBe(s.teams[0].remainingBudget);
  });
  it("conserves total budget on a hypothetical transfer", () => {
    const s = snapshot();
    const start = budgets(s, emptyScenario());
    const scenario = addTrade(s, emptyScenario(), s.teams[0].teamId, s.teams[1].teamId, 20);
    const end = budgets(s, scenario);
    expect(end[0].remaining).toBe(start[0].remaining - 20);
    expect(end[1].remaining).toBe(start[1].remaining + 20);
    expect(end.reduce((n, t) => n + t.remaining, 0)).toBe(
      start.reduce((n, t) => n + t.remaining, 0),
    );
  });
  it.each([0, -1, 1.5, Infinity, NaN])("rejects invalid trade amount %s", (amount) => {
    const s = snapshot();
    expect(() =>
      addTrade(s, emptyScenario(), s.teams[0].teamId, s.teams[1].teamId, amount),
    ).toThrow();
  });
  it("rejects same or missing team", () => {
    const s = snapshot();
    expect(() => addTrade(s, emptyScenario(), s.teams[0].teamId, s.teams[0].teamId, 1)).toThrow();
    expect(() => addTrade(s, emptyScenario(), "missing", s.teams[1].teamId, 1)).toThrow();
  });
  it("rejects overspending and accepts exact remaining balance", () => {
    const s = snapshot();
    const n = s.teams[0].remainingBudget;
    expect(() =>
      addTrade(s, emptyScenario(), s.teams[0].teamId, s.teams[1].teamId, n + 1),
    ).toThrow();
    expect(
      addTrade(s, emptyScenario(), s.teams[0].teamId, s.teams[1].teamId, n).trades,
    ).toHaveLength(1);
  });
});
describe("publication validation", () => {
  it("validates the actual file that will be deployed", () => {
    expect(() => snapshotSchema.parse(published)).not.toThrow();
  });
  it("accepts the complete baseline fixture", () => {
    expect(snapshot().players.length).toBeGreaterThan(0);
  });
  it("rejects duplicate IDs", () => {
    const s = snapshot();
    s.players.push(s.players[0]);
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
  it("rejects broken references", () => {
    const s = snapshot();
    s.players[0].teamId = "missing";
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
  it("rejects keeping expired players", () => {
    const s = snapshot();
    s.players[4].isKeeper = true;
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
  it("rejects stale calculated prices", () => {
    const s = snapshot();
    s.players[0].keeperCost += 1;
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
  it("rejects inconsistent budget totals", () => {
    const s = snapshot();
    s.teams[0].remainingBudget += 1;
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
  it("rejects invalid schema and rule versions", () => {
    expect(() => snapshotSchema.parse({ ...snapshot(), rulesVersion: "other" })).toThrow();
  });
  it("strips unexpected data fields", () => {
    expect(
      snapshotSchema.parse({ ...snapshot(), token: "not-for-publication" }),
    ).not.toHaveProperty("token");
  });
  it("rejects malformed dates and nonfinite values", () => {
    const s = snapshot();
    s.capturedAt = "not a date";
    expect(() => snapshotSchema.parse(s)).toThrow();
    s.league.baseBudget = NaN;
    expect(() => snapshotSchema.parse(s)).toThrow();
  });
});
describe("local scenario storage", () => {
  it("safely handles unavailable storage", () => {
    expect(readScenario(snapshot())).toEqual(emptyScenario());
  });
  it("rejects malformed or obsolete scenarios", () => {
    vi.stubGlobal("localStorage", { getItem: () => '{"keepers":{"missing":true},"trades":[]}' });
    expect(readScenario(snapshot())).toEqual(emptyScenario());
    vi.unstubAllGlobals();
  });
  it("uses a separate key per published baseline", () => {
    const getItem = vi.fn(() => null);
    vi.stubGlobal("localStorage", { getItem });
    const s = snapshot();
    readScenario(s);
    expect(getItem).toHaveBeenCalledWith(`ymffl:scenario:${s.snapshotId}`);
    vi.unstubAllGlobals();
  });
});
