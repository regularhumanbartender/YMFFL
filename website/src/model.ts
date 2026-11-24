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
  season: whole,
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
export type Trade = { id: string; fromTeamId: string; toTeamId: string; amount: number };
export type Scenario = { keepers: Record<string, boolean>; trades: Trade[] };
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
export function budgets(s: Snapshot, scenario: Scenario) {
  return s.teams.map((t) => {
    const keepers = s.players.filter((p) => p.teamId === t.teamId && isKept(p, scenario));
    const spend = keepers.reduce((n, p) => n + keeperCost(p, s.league), 0);
    // Recorded trades are ALREADY included in budgetAdjustment. Apply only hypothetical deltas.
    const delta = scenario.trades.reduce(
      (n, tr) =>
        n +
        (tr.toTeamId === t.teamId ? tr.amount : 0) -
        (tr.fromTeamId === t.teamId ? tr.amount : 0),
      0,
    );
    const preBudget = s.league.baseBudget + t.budgetAdjustment + delta;
    const remaining = preBudget - spend;
    const open = s.league.rosterSize - keepers.length;
    return {
      ...t,
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
export function addTrade(
  s: Snapshot,
  scenario: Scenario,
  from: string,
  to: string,
  amount: number,
): Scenario {
  if (
    from === to ||
    !s.teams.some((t) => t.teamId === from) ||
    !s.teams.some((t) => t.teamId === to)
  ) {
    throw new Error("Choose two different teams.");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Enter a positive whole-dollar amount.");
  }
  const available = budgets(s, scenario).find((t) => t.teamId === from)!.remaining;
  if (amount > available) {
    throw new Error(`The sending team has only ${available} auction dollars available.`);
  }
  return {
    ...scenario,
    trades: [
      ...scenario.trades,
      { id: crypto.randomUUID(), fromTeamId: from, toTeamId: to, amount },
    ],
  };
}
export function readScenario(snapshot: Snapshot): Scenario {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(`ymffl:scenario:${snapshot.snapshotId}`) ?? "null",
    );
    const parsed = z
      .object({
        keepers: z.record(z.boolean()),
        trades: z.array(
          z.object({
            id: z.string(),
            fromTeamId: z.string(),
            toTeamId: z.string(),
            amount: whole.positive(),
          }),
        ),
      })
      .parse(raw);
    const players = new Map(snapshot.players.map((p) => [p.playerId, p]));
    const ids = new Set(snapshot.teams.map((t) => t.teamId));
    if (
      Object.entries(parsed.keepers).some(
        ([id, keep]) => !players.has(id) || (keep && !players.get(id)!.keeperEligible),
      ) ||
      parsed.trades.some(
        (t) => !ids.has(t.fromTeamId) || !ids.has(t.toTeamId) || t.fromTeamId === t.toTeamId,
      )
    ) {
      return emptyScenario();
    }
    return parsed;
  } catch {
    return emptyScenario();
  }
}
