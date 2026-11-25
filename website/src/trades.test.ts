import { afterEach, describe, expect, it, vi } from "vitest";
import nextFixture from "./demo-2027.fixture.json";
import fixture from "./demo.fixture.json";
import {
  type TradeInput,
  addTrade,
  budgets,
  effectiveOwnership,
  emptyScenario,
  isKept,
  keeperCost,
  legacyScenarioKey,
  loadScenario,
  readScenario,
  recordedTradeSchema,
  removeTrade,
  scenarioKey,
  snapshotSchema,
  writeScenario,
} from "./model";

const snapshot = () => snapshotSchema.parse(structuredClone(fixture));
const input = (overrides: Partial<TradeInput> = {}): TradeInput => ({
  fromTeamId: "team-0",
  toTeamId: "team-1",
  fromPlayerIds: ["demo-0-0"],
  toPlayerIds: [],
  amount: 0,
  cashDirection: "fromTo",
  ...overrides,
});
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

describe("ordered player packages and money", () => {
  it("moves a selected keeper, including every effective roster/budget metric", () => {
    const s = snapshot();
    const scenario = addTrade(s, emptyScenario(), input());
    const [a, b] = budgets(s, scenario);
    expect(effectiveOwnership(s, scenario).get("demo-0-0")).toBe("team-1");
    expect(a).toMatchObject({
      rosterCount: 7,
      count: 2,
      spend: 69,
      remaining: 241,
      open: 23,
      maxBid: 219,
    });
    expect(b).toMatchObject({
      rosterCount: 9,
      count: 4,
      spend: 145,
      remaining: 145,
      open: 21,
      maxBid: 125,
    });
  });
  it("supports multiple players on both sides with unbalanced package sizes", () => {
    const s = snapshot();
    const scenario = addTrade(
      s,
      emptyScenario(),
      input({
        fromPlayerIds: ["demo-0-0", "demo-0-1", "demo-0-2"],
        toPlayerIds: ["demo-1-5", "demo-1-6"],
      }),
    );
    const owners = effectiveOwnership(s, scenario);
    for (const id of ["demo-0-0", "demo-0-1", "demo-0-2"]) {
      expect(owners.get(id)).toBe("team-1");
    }
    for (const id of ["demo-1-5", "demo-1-6"]) {
      expect(owners.get(id)).toBe("team-0");
    }
    expect(budgets(s, scenario)[0]).toMatchObject({ rosterCount: 7, count: 2, spend: 30 });
    expect(budgets(s, scenario)[1]).toMatchObject({ rosterCount: 9, count: 4, spend: 184 });
    expect(isKept(s.players[2], scenario)).toBe(false); // no automatic Keep
  });
  it.each(["fromTo", "toFrom"] as const)(
    "conserves cash, spend, IDs and players for combo %s",
    (cashDirection) => {
      const s = snapshot();
      const before = budgets(s, emptyScenario());
      const scenario = addTrade(
        s,
        emptyScenario(),
        input({
          amount: 20,
          cashDirection,
          toPlayerIds: ["demo-1-5"],
        }),
      );
      const after = budgets(s, scenario);
      for (const metric of ["preBudget", "remaining", "spend", "count", "rosterCount"] as const) {
        expect(after.reduce((n, t) => n + t[metric], 0)).toBe(
          before.reduce((n, t) => n + t[metric], 0),
        );
      }
      expect(after[0].remaining).toBe(
        before[0].remaining + 38 - 15 + (cashDirection === "fromTo" ? -20 : 20),
      );
      expect([...effectiveOwnership(s, scenario).keys()].sort()).toEqual(
        s.players.map((p) => p.playerId).sort(),
      );
    },
  );
  it.each(["fromTo", "toFrom"] as const)(
    "retains cash-only transfers in direction %s",
    (cashDirection) => {
      const s = snapshot();
      const scenario = addTrade(
        s,
        emptyScenario(),
        input({ fromPlayerIds: [], amount: 15, cashDirection }),
      );
      expect([...effectiveOwnership(s, scenario)]).toEqual(
        s.players.map((p) => [p.playerId, p.teamId]),
      );
      expect(budgets(s, scenario)[0].remaining).toBe(203 + (cashDirection === "fromTo" ? -15 : 15));
    },
  );
  it("keeper choices travel and can be toggled on the receiving roster", () => {
    const s = snapshot();
    const scenario = addTrade(
      s,
      { keepers: { "demo-0-2": true }, trades: [] },
      input({ fromPlayerIds: ["demo-0-2"] }),
    );
    expect(budgets(s, scenario)[1].spend).toBe(148);
    const toggled = { ...scenario, keepers: { "demo-0-2": false } };
    expect(budgets(s, toggled)[1].spend).toBe(107);
    expect(budgets(s, toggled)[0].spend).toBe(107);
  });
  it("never changes eligibility, contracts, prices, global position ranks or the source snapshot", () => {
    const s = snapshot();
    const before = structuredClone(s);
    const scenario = addTrade(
      s,
      emptyScenario(),
      input({ fromPlayerIds: ["demo-0-4", "demo-0-5"] }),
    );
    expect(effectiveOwnership(s, scenario).get("demo-0-4")).toBe("team-1");
    expect(s).toEqual(before);
    expect(scenario.keepers).toEqual({});
    expect(s.players.map((p) => keeperCost(p, s.league))).toEqual(
      before.players.map((p) => p.keeperCost),
    );
    expect(() => budgets(s, { ...scenario, keepers: { "demo-0-4": true } })).toThrow(/ineligible/);
    expect(budgets(s, emptyScenario()).map((t) => t.remaining)).toEqual(
      s.teams.map((t) => t.remainingBudget),
    );
  });
  it("does not mutate the earlier scenario or the supplied player arrays", () => {
    const s = snapshot();
    const original = emptyScenario();
    const pkg = input();
    const scenario = addTrade(s, original, pkg);
    pkg.fromPlayerIds.push("demo-0-1");
    expect(scenario.trades[0].fromPlayerIds).toEqual(["demo-0-0"]);
    expect(original).toEqual(emptyScenario());
  });
  it("allows A → B → C → A and replays both sides against current ownership", () => {
    const s = snapshot();
    let scenario = addTrade(s, emptyScenario(), input());
    scenario = addTrade(s, scenario, input({ fromTeamId: "team-1", toTeamId: "team-2" }));
    scenario = addTrade(s, scenario, input({ fromTeamId: "team-2", toTeamId: "team-0" }));
    expect(effectiveOwnership(s, scenario).get("demo-0-0")).toBe("team-0");
    expect(budgets(s, scenario)).toEqual(budgets(s, emptyScenario()));
  });
  it("blocks removing an earlier dependency without deleting or silently skipping later trades", () => {
    const s = snapshot();
    const first = addTrade(s, emptyScenario(), input());
    const chain = addTrade(s, first, input({ fromTeamId: "team-1", toTeamId: "team-2" }));
    const saved = structuredClone(chain);
    expect(() => removeTrade(s, chain, chain.trades[0].id)).toThrow(
      /Remove dependent later trades first/,
    );
    expect(chain).toEqual(saved);
    const removed = removeTrade(s, chain, chain.trades[1].id);
    expect(removed).toEqual(first);
    expect(removeTrade(s, removed, removed.trades[0].id)).toEqual(emptyScenario());
  });
  it("can remove an independent earlier trade without touching later trades", () => {
    const s = snapshot();
    let scenario = addTrade(s, emptyScenario(), input());
    scenario = addTrade(s, scenario, input({ fromPlayerIds: ["demo-0-1"] }));
    const result = removeTrade(s, scenario, scenario.trades[0].id);
    expect(result.trades).toEqual([scenario.trades[1]]);
    expect(effectiveOwnership(s, result).get("demo-0-0")).toBe("team-0");
    expect(effectiveOwnership(s, result).get("demo-0-1")).toBe("team-1");
  });
  it("new cash can use spend released by an outgoing kept player", () => {
    const s = snapshot();
    const scenario = addTrade(s, emptyScenario(), input({ amount: 241 }));
    expect(budgets(s, scenario)[0].remaining).toBe(0);
    expect(() => addTrade(s, emptyScenario(), input({ amount: 242 }))).toThrow(
      /241 auction dollars/,
    );
  });
  it("incoming keeper spend reduces the NEW sender's affordability after both player legs", () => {
    const s = snapshot();
    const pkg = input({ fromPlayerIds: [], toPlayerIds: ["demo-1-0"], amount: 166 });
    expect(() => addTrade(s, emptyScenario(), pkg)).toThrow(/165 auction dollars/);
    expect(budgets(s, addTrade(s, emptyScenario(), { ...pkg, amount: 165 }))[0].remaining).toBe(0);
  });
  it("checks reverse-direction cash using the correct team's released spend", () => {
    const s = snapshot();
    const scenario = addTrade(
      s,
      emptyScenario(),
      input({
        fromPlayerIds: [],
        toPlayerIds: ["demo-1-0"],
        cashDirection: "toFrom",
        amount: 221,
      }),
    );
    expect(budgets(s, scenario)[1].remaining).toBe(0);
  });
  it("new affordability includes all previous simulated cash changes", () => {
    const s = snapshot();
    const scenario = addTrade(s, emptyScenario(), input({ fromPlayerIds: [], amount: 200 }));
    expect(() => addTrade(s, scenario, input({ amount: 42 }))).toThrow(/41 auction dollars/);
    expect(budgets(s, addTrade(s, scenario, input({ amount: 41 })))[0].remaining).toBe(0);
  });
  it("accepts player-only deficits and flags underfunded and over-limit teams", () => {
    const s = snapshot();
    s.league.baseBudget = 100;
    s.league.rosterSize = 3;
    const scenario = addTrade(s, emptyScenario(), input());
    const [a, b] = budgets(s, scenario);
    expect(a.status).toBe("Ready");
    expect(b.remaining).toBeLessThan(0);
    expect(b.status).toBe("Over roster limit");
    s.league.rosterSize = 16;
    expect(budgets(s, scenario)[1].status).toBe("Underfunded");
    expect(() =>
      addTrade(
        s,
        scenario,
        input({
          fromTeamId: "team-1",
          toTeamId: "team-2",
          fromPlayerIds: [],
          amount: 1,
        }),
      ),
    ).toThrow(/auction dollars available/);
  });
  it("does not double count official cash ledger when moving players and dollars", () => {
    const s = snapshot();
    const pkg = input({ amount: 10 });
    const before = budgets(s, addTrade(s, emptyScenario(), pkg));
    s.trades.push({
      tradeId: "official",
      fromTeamId: "team-0",
      toTeamId: "team-1",
      amount: 50,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(budgets(s, addTrade(s, emptyScenario(), pkg))).toEqual(before);
    expect(recordedTradeSchema.safeParse({ ...s.trades[0], amount: 0 }).success).toBe(false);
  });
  it.each([
    { fromPlayerIds: ["demo-0-0", "demo-0-0"] },
    { toPlayerIds: ["demo-0-0"] },
    { fromPlayerIds: ["demo-1-0"] },
    { toPlayerIds: ["demo-2-0"] },
    { fromPlayerIds: ["fictional-2027-player"] },
    { fromPlayerIds: ["missing"] },
    { fromTeamId: "missing" },
    { toTeamId: "team-0" },
    { fromPlayerIds: [], amount: 0 },
    { amount: -1 },
    { amount: 0.5 },
    { amount: Infinity },
    { amount: NaN },
  ])("rejects invalid package %j with no source or scenario mutations", (invalid) => {
    const s = snapshot();
    const scenario = emptyScenario();
    const before = structuredClone(s);
    expect(() => addTrade(s, scenario, input(invalid))).toThrow();
    expect(s).toEqual(before);
    expect(scenario).toEqual(emptyScenario());
  });
});

describe("v2 storage boundaries, reload and cash-only migration", () => {
  it("roundtrips a multi-leg player/cash chain with keeper decisions", () => {
    const data = storage();
    const s = snapshot();
    let scenario = addTrade(
      s,
      { keepers: { "demo-0-2": true }, trades: [] },
      input({ amount: 10 }),
    );
    scenario = addTrade(s, scenario, input({ fromTeamId: "team-1", toTeamId: "team-2" }));
    writeScenario(s, scenario);
    expect(scenarioKey(s)).toBe(`ymffl:scenario:v2:${s.league.leagueId}:${s.snapshotId}`);
    expect(JSON.parse(data.get(scenarioKey(s))!)).toMatchObject({
      version: 2,
      snapshotId: s.snapshotId,
      leagueId: s.league.leagueId,
    });
    expect(readScenario(s)).toEqual(scenario);
    expect(budgets(s, readScenario(s))).toEqual(budgets(s, scenario));
    expect(data.has(legacyScenarioKey(s))).toBe(false);
  });
  it("retains accepted ownership/cash history after later keepers make the sender underfunded", () => {
    storage();
    const s = snapshot();
    const scenario = addTrade(s, emptyScenario(), input({ fromPlayerIds: [], amount: 200 }));
    scenario.keepers["demo-0-2"] = true;
    writeScenario(s, scenario);
    expect(budgets(s, readScenario(s))[0].status).toBe("Underfunded");
    expect(readScenario(s)).toEqual(scenario);
  });
  it.each(["cycle", "original"])(
    "copies exact-baseline legacy %s cash plans without overwriting the old key",
    (kind) => {
      const data = storage();
      const s = snapshot();
      const old = {
        keepers: { "demo-0-2": true },
        trades: [{ id: "old-cash", fromTeamId: "team-0", toTeamId: "team-1", amount: 10 }],
      };
      const key = kind === "cycle" ? legacyScenarioKey(s) : `ymffl:scenario:${s.snapshotId}`;
      data.set(key, JSON.stringify(old));
      const loaded = loadScenario(s);
      expect(loaded.notice).toMatch(/copied/);
      expect(loaded.scenario.trades[0]).toEqual({
        ...old.trades[0],
        fromPlayerIds: [],
        toPlayerIds: [],
        cashDirection: "fromTo",
      });
      expect(data.get(key)).toBe(JSON.stringify(old));
      expect(data.has(scenarioKey(s))).toBe(true);
      expect(readScenario(s)).toEqual(loaded.scenario);
      // Old clients can still edit their own copy, but cannot drop v2's player legs.
      data.set(key, JSON.stringify(emptyScenario()));
      const updated = addTrade(s, loaded.scenario, input());
      writeScenario(s, updated);
      expect(readScenario(s)).toEqual(updated);
    },
  );
  it("keeps years and exact baselines separate even when their snapshot and player IDs collide", () => {
    const data = storage();
    const s = snapshot();
    const next = { ...snapshotSchema.parse(nextFixture), snapshotId: s.snapshotId };
    const scenario = addTrade(s, emptyScenario(), input());
    writeScenario(s, scenario);
    expect(readScenario(next)).toEqual(emptyScenario());
    expect(readScenario({ ...s, snapshotId: "new-baseline" })).toEqual(emptyScenario());
    data.set(scenarioKey(next), data.get(scenarioKey(s))!);
    expect(readScenario(next)).toEqual(emptyScenario()); // even miscopied envelopes fail closed
    expect(readScenario(s)).toEqual(scenario);
  });
  it("reset writes an empty v2 tombstone only for the current cycle, preventing legacy resurrection", () => {
    const data = storage();
    const s = snapshot();
    const next = snapshotSchema.parse(nextFixture);
    data.set(legacyScenarioKey(s), JSON.stringify({ keepers: { "demo-0-0": false }, trades: [] }));
    writeScenario(next, { keepers: { [next.players[0].playerId]: false }, trades: [] });
    const nextSaved = data.get(scenarioKey(next));
    expect(readScenario(s).keepers).not.toEqual({});
    writeScenario(s, emptyScenario());
    expect(readScenario(s)).toEqual(emptyScenario());
    expect(data.has(legacyScenarioKey(s))).toBe(true);
    expect(data.get(scenarioKey(next))).toBe(nextSaved);
  });
  it.each([
    "wrong-owner",
    "unknown-player",
    "duplicate-player",
    "duplicate-trade",
    "unknown-team",
    "unknown-keeper",
    "ineligible-keeper",
    "bad-version",
    "wrong-baseline",
    "extra-field",
    "no-legs",
    "bad-json",
  ])("fails the entire malformed v2 plan closed: %s", (kind) => {
    const data = storage();
    const s = snapshot();
    const scenario = addTrade(s, emptyScenario(), input());
    const stored = {
      version: 2,
      leagueId: s.league.leagueId,
      snapshotId: s.snapshotId,
      ...structuredClone(scenario),
    };
    const t = stored.trades[0];
    if (kind === "wrong-owner") {
      t.fromPlayerIds = ["demo-1-0"];
    }
    if (kind === "unknown-player") {
      t.fromPlayerIds = ["stale-player"];
    }
    if (kind === "duplicate-player") {
      t.toPlayerIds = t.fromPlayerIds;
    }
    if (kind === "duplicate-trade") {
      stored.trades.push(t);
    }
    if (kind === "unknown-team") {
      t.toTeamId = "missing";
    }
    if (kind === "unknown-keeper") {
      stored.keepers.missing = true;
    }
    if (kind === "ineligible-keeper") {
      stored.keepers["demo-0-4"] = true;
    }
    if (kind === "bad-version") {
      stored.version = 1;
    }
    if (kind === "wrong-baseline") {
      stored.snapshotId = "different";
    }
    if (kind === "extra-field") {
      Object.assign(t, { unknown: [] });
    }
    if (kind === "no-legs") {
      t.fromPlayerIds = [];
    }
    const raw = kind === "bad-json" ? "{" : JSON.stringify(stored);
    data.set(scenarioKey(s), raw);
    data.set(legacyScenarioKey(s), JSON.stringify({ keepers: { "demo-0-0": false }, trades: [] }));
    expect(loadScenario(s)).toMatchObject({
      scenario: emptyScenario(),
      notice: expect.stringMatching(/invalid/),
    });
    expect(data.get(scenarioKey(s))).toBe(raw);
  });
  it("rejects a stored chain whose prerequisite disappeared, not just the invalid later leg", () => {
    const data = storage();
    const s = snapshot();
    let scenario = addTrade(s, emptyScenario(), input());
    scenario = addTrade(s, scenario, input({ fromTeamId: "team-1", toTeamId: "team-2" }));
    data.set(
      scenarioKey(s),
      JSON.stringify({
        version: 2,
        leagueId: s.league.leagueId,
        snapshotId: s.snapshotId,
        ...scenario,
        trades: scenario.trades.slice(1),
      }),
    );
    expect(readScenario(s)).toEqual(emptyScenario());
  });
  it("does not silently strip player legs from a malformed legacy plan", () => {
    const data = storage();
    const s = snapshot();
    data.set(
      legacyScenarioKey(s),
      JSON.stringify(addTrade(s, emptyScenario(), input({ amount: 1 }))),
    );
    expect(readScenario(s)).toEqual(emptyScenario());
    expect(data.has(scenarioKey(s))).toBe(false);
  });
  it("handles blocked storage without crashing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadScenario(snapshot()).scenario).toEqual(emptyScenario());
  });
});
