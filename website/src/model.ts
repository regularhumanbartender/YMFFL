import { z } from "zod";

const money = z.number().finite().nonnegative();
const whole = money.int().safe();
export const playerSchema = z.object({
  playerId: z.string().min(1),
  teamId: z.string().min(1),
  playerName: z.string().min(1),
  position: z.string(),
  positionRank: z.number().int().nonnegative().optional(),
  auctionValue: whole,
  keeperCost: money,
  keeperEligible: z.boolean(),
  eligibilityNote: z.string(),
  isKeeper: z.boolean(),
  underContract: z.boolean(),
  contractLabel: z.string(),
  overrideEnabled: z.boolean(),
  overrideValue: whole,
  fantasyPoints: z.number().finite().optional(),
});
export const teamSchema = z.object({
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  budgetAdjustment: z.number().int().safe(),
  keeperSpend: money,
  keeperCount: whole,
  remainingBudget: z.number().finite(),
});
export const leagueSchema = z.object({
  leagueId: z.string().min(1),
  leagueName: z.string().min(1),
  season: whole.min(2000).max(9999),
  baseBudget: whole,
  rosterSize: whole.min(1).max(100),
  minimumBid: whole.min(1),
  qbEliteRank: whole,
  rbEliteRank: whole,
  wrEliteRank: whole,
  teEliteRank: whole,
  eliteIncrease: money.max(10),
  elitePremium: whole,
  eliteMinimum: whole,
  standardIncrease: money.max(10),
  standardPremium: whole,
  standardMinimum: whole,
  defenseIncrease: whole,
  defenseMinimum: whole,
});
export const recordedTradeSchema = z.object({
  tradeId: z.string().min(1),
  fromTeamId: z.string().min(1),
  toTeamId: z.string().min(1),
  amount: whole.positive(),
  status: z.enum(["ACTIVE", "VOID"]),
  createdAt: z.string().datetime(),
});
export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    // Pricing algorithm version, not the selected cycle. Unchanged for the 2027 keeper year.
    rulesVersion: z.literal("ymffl-2026-v1"),
    snapshotId: z.string().min(1),
    capturedAt: z.string().datetime(),
    source: z.enum(["foundry", "demo"]),
    league: leagueSchema,
    teams: z.array(teamSchema).min(2).max(100),
    players: z.array(playerSchema).min(1).max(1000),
    trades: z.array(recordedTradeSchema),
  })
  .superRefine((s, ctx) => {
    const keyedYear = /^(?:ymffl|demo)-(\d{4})$/.exec(s.league.leagueId)?.[1];
    if (keyedYear && Number(keyedYear) !== s.league.season) {
      ctx.addIssue({ code: "custom", message: "League key and keeper year disagree" });
    }
    const teamIds = new Set(s.teams.map((t) => t.teamId));
    if (
      teamIds.size !== s.teams.length ||
      new Set(s.players.map((p) => p.playerId)).size !== s.players.length ||
      new Set(s.trades.map((t) => t.tradeId)).size !== s.trades.length
    ) {
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers in snapshot" });
    }
    for (const p of s.players) {
      if (!teamIds.has(p.teamId) || (p.isKeeper && !p.keeperEligible)) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid team or keeper eligibility for ${p.playerId}`,
        });
      }
      if (keeperCost(p, s.league) !== p.keeperCost) {
        ctx.addIssue({
          code: "custom",
          message: `Pricing mismatch for ${p.playerId}; check league rules`,
        });
      }
    }
    for (const t of s.trades) {
      if (!teamIds.has(t.fromTeamId) || !teamIds.has(t.toTeamId) || t.fromTeamId === t.toTeamId) {
        ctx.addIssue({ code: "custom", message: "Trade references invalid teams" });
      }
    }
    for (const t of s.teams) {
      const keepers = s.players.filter((p) => p.teamId === t.teamId && p.isKeeper);
      const spend = keepers.reduce((n, p) => n + p.keeperCost, 0);
      if (
        spend !== t.keeperSpend ||
        keepers.length !== t.keeperCount ||
        s.league.baseBudget + t.budgetAdjustment - spend !== t.remainingBudget
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Budget mismatch for ${t.teamId}; retry after Foundry recalculation`,
        });
      }
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Player = z.infer<typeof playerSchema>;
export type League = z.infer<typeof leagueSchema>;
export type Team = z.infer<typeof teamSchema>;
// Local-only packages. The positive-cash recordedTradeSchema / public JSON contract is unchanged.
export const scenarioTradeSchema = z
  .object({
    id: z.string().min(1),
    fromTeamId: z.string().min(1), // Team A; cash can go in either direction.
    toTeamId: z.string().min(1), // Team B
    fromPlayerIds: z.array(z.string().min(1)).max(1000),
    toPlayerIds: z.array(z.string().min(1)).max(1000),
    amount: whole,
    cashDirection: z.enum(["fromTo", "toFrom"]),
  })
  .strict()
  .refine((t) => t.amount > 0 || t.fromPlayerIds.length + t.toPlayerIds.length > 0, {
    message: "Choose at least one player or enter auction dollars.",
  });
export type Trade = z.infer<typeof scenarioTradeSchema>;
export type TradeInput = Omit<Trade, "id">;
export type Scenario = { keepers: Record<string, boolean>; trades: Trade[] };
const scenarioSchema = z
  .object({
    keepers: z.record(z.string(), z.boolean()),
    trades: z.array(scenarioTradeSchema).max(1000),
  })
  .strict();
export const emptyScenario = (): Scenario => ({ keepers: {}, trades: [] });

// Mirrors YmfflLeagueActions.cost / recalculate (functions-typescript/src/index.ts).
export function keeperCost(
  p: Pick<
    Player,
    | "keeperEligible"
    | "overrideEnabled"
    | "overrideValue"
    | "auctionValue"
    | "underContract"
    | "position"
    | "positionRank"
  >,
  l: League,
): number {
  if (!p.keeperEligible) {
    return 0;
  }
  if (p.overrideEnabled) {
    return p.overrideValue;
  }
  if (p.underContract) {
    return p.auctionValue;
  }
  if (!["QB", "RB", "WR", "TE"].includes(p.position)) {
    return Math.max(p.auctionValue + l.defenseIncrease, l.defenseMinimum);
  }
  const cutoff = (
    { QB: l.qbEliteRank, RB: l.rbEliteRank, WR: l.wrEliteRank, TE: l.teEliteRank } as Record<
      string,
      number
    >
  )[p.position];
  const elite = p.positionRank !== undefined && p.positionRank > 0 && p.positionRank <= cutoff;
  return Math.round(
    Math.max(
      p.auctionValue * (1 + (elite ? l.eliteIncrease : l.standardIncrease)),
      p.auctionValue + (elite ? l.elitePremium : l.standardPremium),
      elite ? l.eliteMinimum : l.standardMinimum,
    ),
  );
}
export function isKept(p: Player, scenario: Scenario): boolean {
  return scenario.keepers[p.playerId] ?? p.isKeeper;
}
// Ownership is replayed in order, independent of today's keeper decisions and affordability.
// An accepted cash history must survive later keeper toggles that create a deficit.
export function effectiveOwnership(s: Snapshot, scenario: Scenario): Map<string, string> {
  const parsed = scenarioSchema.parse(scenario);
  const players = new Map(s.players.map((p) => [p.playerId, p]));
  const owners = new Map(s.players.map((p) => [p.playerId, p.teamId]));
  const teams = new Set(s.teams.map((t) => t.teamId));
  if (
    Object.entries(parsed.keepers).some(
      ([id, kept]) => !players.has(id) || (kept && !players.get(id)!.keeperEligible),
    )
  ) {
    throw new Error("Keeper decisions reference an unknown or ineligible player.");
  }
  const tradeIds = new Set<string>();
  for (const [index, t] of parsed.trades.entries()) {
    if (t.fromTeamId === t.toTeamId || !teams.has(t.fromTeamId) || !teams.has(t.toTeamId)) {
      throw new Error("Choose two different teams.");
    }
    if (tradeIds.has(t.id)) {
      throw new Error("Duplicate scenario trade ID.");
    }
    tradeIds.add(t.id);
    const ids = [...t.fromPlayerIds, ...t.toPlayerIds];
    if (new Set(ids).size !== ids.length) {
      throw new Error("A player can appear only once in a trade, on one side.");
    }
    // Validate both legs against the same pre-trade ownership, then move simultaneously.
    for (const [selected, expected] of [
      [t.fromPlayerIds, t.fromTeamId],
      [t.toPlayerIds, t.toTeamId],
    ] as const) {
      for (const id of selected) {
        const p = players.get(id);
        if (!p || owners.get(id) !== expected) {
          throw new Error(
            `Trade ${index + 1}: ${p?.playerName ?? id} is not on that team's current simulated roster.`,
          );
        }
      }
    }
    t.fromPlayerIds.forEach((id) => owners.set(id, t.toTeamId));
    t.toPlayerIds.forEach((id) => owners.set(id, t.fromTeamId));
  }
  return owners;
}
function calculateBudgets(s: Snapshot, scenario: Scenario, owners: Map<string, string>) {
  return s.teams.map((t) => {
    const roster = s.players.filter((p) => owners.get(p.playerId) === t.teamId);
    const keepers = roster.filter((p) => isKept(p, scenario));
    const spend = keepers.reduce((n, p) => n + keeperCost(p, s.league), 0);
    // Recorded trades are ALREADY included in budgetAdjustment. Never replay the source ledger.
    const delta = scenario.trades.reduce((n, tr) => {
      const sender = tr.cashDirection === "fromTo" ? tr.fromTeamId : tr.toTeamId;
      const receiver = tr.cashDirection === "fromTo" ? tr.toTeamId : tr.fromTeamId;
      return n + (receiver === t.teamId ? tr.amount : 0) - (sender === t.teamId ? tr.amount : 0);
    }, 0);
    const preBudget = s.league.baseBudget + t.budgetAdjustment + delta;
    const remaining = preBudget - spend;
    const open = s.league.rosterSize - keepers.length;
    return {
      ...t,
      rosterCount: roster.length,
      spend,
      remaining,
      preBudget,
      count: keepers.length,
      open,
      maxBid: open > 0 ? Math.max(0, remaining - (open - 1) * s.league.minimumBid) : 0,
      average: open > 0 ? remaining / open : 0,
      status:
        open < 0
          ? "Over roster limit"
          : remaining < Math.max(0, open) * s.league.minimumBid
            ? "Underfunded"
            : "Ready",
    };
  });
}
export function budgets(s: Snapshot, scenario: Scenario) {
  return calculateBudgets(s, scenario, effectiveOwnership(s, scenario));
}
export function addTrade(s: Snapshot, scenario: Scenario, input: TradeInput): Scenario {
  if (!Number.isSafeInteger(input.amount) || input.amount < 0) {
    throw new Error("Enter zero or a positive whole-dollar amount.");
  }
  const parsed = scenarioTradeSchema.safeParse({ ...input, id: crypto.randomUUID() });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }
  const trade = parsed.data;
  const next = { ...scenario, trades: [...scenario.trades, trade] };
  const owners = effectiveOwnership(s, next);
  if (trade.amount > 0) {
    const sender = trade.cashDirection === "fromTo" ? trade.fromTeamId : trade.toTeamId;
    // New cash uses current balances AFTER both player legs, but BEFORE the new cash leg.
    const available = calculateBudgets(s, scenario, owners).find(
      (t) => t.teamId === sender,
    )!.remaining;
    if (trade.amount > available) {
      throw new Error(
        `After the player moves, the cash-sending team has only ${available} auction dollars available.`,
      );
    }
  }
  return next;
}
export function removeTrade(s: Snapshot, scenario: Scenario, id: string): Scenario {
  const next = { ...scenario, trades: scenario.trades.filter((t) => t.id !== id) };
  try {
    effectiveOwnership(s, next);
  } catch {
    throw new Error(
      "Cannot remove this trade: a later player move depends on it. Remove dependent later trades first.",
    );
  }
  return next;
}
// v2 is deliberately invisible to old cash-only clients. Never overwrite either legacy key.
export const legacyScenarioKey = (s: Snapshot) =>
  `ymffl:scenario:${s.league.leagueId}:${s.snapshotId}`;
export const scenarioKey = (s: Snapshot) =>
  `ymffl:scenario:v2:${s.league.leagueId}:${s.snapshotId}`;
export function writeScenario(s: Snapshot, scenario: Scenario): void {
  effectiveOwnership(s, scenario);
  localStorage.setItem(
    scenarioKey(s),
    JSON.stringify({
      version: 2,
      leagueId: s.league.leagueId,
      snapshotId: s.snapshotId,
      ...scenario,
    }),
  );
}
const storedScenarioSchema = z
  .object({
    version: z.literal(2),
    leagueId: z.string(),
    snapshotId: z.string(),
    keepers: z.record(z.string(), z.boolean()),
    trades: z.array(scenarioTradeSchema).max(1000),
  })
  .strict();
const legacySchema = z
  .object({
    keepers: z.record(z.string(), z.boolean()),
    trades: z
      .array(
        z
          .object({
            id: z.string().min(1),
            fromTeamId: z.string().min(1),
            toTeamId: z.string().min(1),
            amount: whole.positive(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export function loadScenario(s: Snapshot): { scenario: Scenario; notice: string } {
  try {
    const raw = localStorage.getItem(scenarioKey(s));
    if (raw !== null) {
      const stored = storedScenarioSchema.parse(JSON.parse(raw));
      if (stored.leagueId !== s.league.leagueId || stored.snapshotId !== s.snapshotId) {
        throw new Error("Scenario baseline mismatch.");
      }
      const scenario = { keepers: stored.keepers, trades: stored.trades };
      effectiveOwnership(s, scenario);
      return { scenario, notice: "" };
    }
    const legacy =
      localStorage.getItem(legacyScenarioKey(s)) ??
      (s.league.season === 2026 && ["ymffl-2026", "demo-2026"].includes(s.league.leagueId)
        ? localStorage.getItem(`ymffl:scenario:${s.snapshotId}`)
        : null);
    if (legacy === null) {
      return { scenario: emptyScenario(), notice: "" };
    }
    const old = legacySchema.parse(JSON.parse(legacy));
    const scenario: Scenario = {
      keepers: old.keepers,
      trades: old.trades.map((t) => ({
        ...t,
        fromPlayerIds: [],
        toPlayerIds: [],
        cashDirection: "fromTo",
      })),
    };
    effectiveOwnership(s, scenario);
    try {
      writeScenario(s, scenario);
      return {
        scenario,
        notice:
          "Your cash-only plan was copied to the new player-trade format. The original is unchanged.",
      };
    } catch {
      return {
        scenario,
        notice:
          "Your original cash-only plan was loaded, but browser storage could not save the upgraded copy.",
      };
    }
  } catch {
    // Fail the entire plan closed: never drop just the invalid legs or fall back to an older plan.
    return {
      scenario: emptyScenario(),
      notice:
        "Saved scenario unavailable or invalid for this exact baseline. No saved trades were applied. The stored plan was left unchanged.",
    };
  }
}
export function readScenario(s: Snapshot): Scenario {
  return loadScenario(s).scenario;
}
