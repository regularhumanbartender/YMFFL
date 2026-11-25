// SERVER ONLY: current-object, paginated, read-only OSDK access. Never import into the browser.
import type { Client } from "@osdk/client";
import {
  YmfflAuctionTrade,
  YmfflKeeperPlayer,
  YmfflLeagueSettings,
  YmfflLeagueTeam,
} from "@ymffl-website/sdk";
import type { Snapshot } from "../website/src/model";
import { buildSnapshot } from "./publish-snapshots";

export async function readSnapshots(
  client: Client,
  selection: string,
  capturedAt: string,
): Promise<Snapshot[]> {
  const configs = [];
  for await (const l of client(YmfflLeagueSettings)
    .where({ leagueId: selection === "all" ? { $startsWith: "ymffl-" } : { $eq: selection } })
    .asyncIter({
      $select: [
        "leagueId",
        "leagueName",
        "season",
        "baseBudget",
        "rosterSize",
        "minimumBid",
        "qbEliteRank",
        "rbEliteRank",
        "wrEliteRank",
        "teEliteRank",
        "eliteIncrease",
        "elitePremium",
        "eliteMinimum",
        "standardIncrease",
        "standardPremium",
        "standardMinimum",
        "defenseIncrease",
        "defenseMinimum",
      ],
    })) {
    if (configs.length >= 100) {
      throw new Error("League count exceeds publication limit.");
    }
    configs.push({
      leagueId: l.leagueId,
      leagueName: l.leagueName,
      season: l.season,
      baseBudget: l.baseBudget ?? 300,
      rosterSize: l.rosterSize ?? 25,
      minimumBid: l.minimumBid ?? 1,
      qbEliteRank: l.qbEliteRank ?? 0,
      rbEliteRank: l.rbEliteRank ?? 0,
      wrEliteRank: l.wrEliteRank ?? 0,
      teEliteRank: l.teEliteRank ?? 0,
      eliteIncrease: l.eliteIncrease ?? 0.2,
      elitePremium: l.elitePremium ?? 10,
      eliteMinimum: l.eliteMinimum ?? 15,
      standardIncrease: l.standardIncrease ?? 0.1,
      standardPremium: l.standardPremium ?? 0,
      standardMinimum: l.standardMinimum ?? 10,
      defenseIncrease: l.defenseIncrease ?? 2,
      defenseMinimum: l.defenseMinimum ?? 2,
    });
  }
  if (!configs.length || (selection !== "all" && configs.length !== 1)) {
    throw new Error("No league configurations found, or selected league is not unique.");
  }
  const snapshots: Snapshot[] = [];
  for (const config of configs) {
    const leagueId = config.leagueId;
    if (
      !leagueId ||
      !/^ymffl-\d{4}$/.test(leagueId) ||
      Number(config.season) !== Number(leagueId.slice(-4))
    ) {
      throw new Error("League ID and keeper year must agree (ymffl-YYYY).");
    }
    const teams = [];
    for await (const t of client(YmfflLeagueTeam)
      .where({ leagueId: { $eq: leagueId } })
      .asyncIter({
        $select: [
          "teamId",
          "teamName",
          "budgetAdjustment",
          "keeperSpend",
          "keeperCount",
          "remainingBudget",
        ],
      })) {
      if (teams.length >= 100) {
        throw new Error("Team count exceeds planning limit.");
      }
      teams.push({
        teamId: t.teamId,
        teamName: t.teamName,
        budgetAdjustment: t.budgetAdjustment ?? 0,
        keeperSpend: t.keeperSpend,
        keeperCount: t.keeperCount,
        remainingBudget: t.remainingBudget,
      });
    }
    const players = [];
    for await (const p of client(YmfflKeeperPlayer)
      .where({ leagueId: { $eq: leagueId } })
      .asyncIter({
        $select: [
          "playerId",
          "teamId",
          "playerName",
          "position",
          "positionRank",
          "auctionValue",
          "keeperCost",
          "keeperEligible",
          "eligibilityNote",
          "isKeeper",
          "underContract",
          "contractLabel",
          "overrideEnabled",
          "overrideValue",
          "fantasyPoints",
        ],
      })) {
      if (players.length >= 1000) {
        throw new Error("Player count exceeds planning limit.");
      }
      players.push({
        playerId: p.playerId,
        teamId: p.teamId,
        playerName: p.playerName,
        position: p.position ?? "",
        positionRank: p.positionRank,
        auctionValue: p.auctionValue ?? 0,
        keeperCost: p.keeperCost,
        keeperEligible: p.keeperEligible ?? false,
        eligibilityNote: p.eligibilityNote ?? "",
        isKeeper: p.isKeeper ?? false,
        underContract: p.underContract ?? false,
        contractLabel: p.contractLabel ?? "",
        overrideEnabled: p.overrideEnabled ?? false,
        overrideValue: p.overrideValue ?? 0,
        fantasyPoints: p.fantasyPoints,
      });
    }
    const trades = [];
    for await (const t of client(YmfflAuctionTrade)
      .where({ leagueId: { $eq: leagueId } })
      .asyncIter({
        $select: ["tradeId", "fromTeamId", "toTeamId", "amount", "status", "createdAt"],
      })) {
      if (trades.length >= 10000) {
        throw new Error("Trade count exceeds snapshot limit.");
      }
      // Explicit allowlist: user IDs, audit identities, free-text notes and object metadata are never published.
      trades.push({
        tradeId: t.tradeId,
        fromTeamId: t.fromTeamId,
        toTeamId: t.toTeamId,
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt,
      });
    }
    // Each asyncIter paginates through ALL current objects for this league.
    // Cross-type reads are not transactional; pricing and total validation fails closed on inconsistent data.
    players.sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));
    teams.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)));
    trades.sort((a, b) => String(a.tradeId).localeCompare(String(b.tradeId)));
    snapshots.push(buildSnapshot({ league: config, teams, players, trades }, capturedAt));
  }
  return snapshots;
}
