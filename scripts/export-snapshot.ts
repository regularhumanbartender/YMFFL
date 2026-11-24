// SERVER / SCHEDULED JOB ONLY. Never import into website/src.
import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";
import {
  YmfflAuctionTrade,
  YmfflKeeperPlayer,
  YmfflLeagueSettings,
  YmfflLeagueTeam,
} from "@ymffl-website/sdk";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { snapshotSchema } from "../website/src/model";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}; no snapshot was replaced.`);
  }
  return value;
}
const url = required("FOUNDRY_URL");
if (new URL(url).protocol !== "https:") {
  throw new Error("Foundry URL must use HTTPS.");
}
const auth = createConfidentialOauthClient(
  required("FOUNDRY_CLIENT_ID"),
  required("FOUNDRY_CLIENT_SECRET"),
  url,
  ["api:use-ontologies-read"],
);
const client = createClient(url, required("FOUNDRY_ONTOLOGY_RID"), auth);
const leagueId = required("FOUNDRY_LEAGUE_ID");
await auth.signIn();
const started = new Date().toISOString();
const configs = [];
for await (const l of client(YmfflLeagueSettings)
  .where({ leagueId: { $eq: leagueId } })
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
if (configs.length !== 1) {
  throw new Error("Expected exactly one league configuration.");
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
  .asyncIter({ $select: ["tradeId", "fromTeamId", "toTeamId", "amount", "status", "createdAt"] })) {
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
// Different object types are not read in one cross-type transaction. Validation below
// rejects price / team-total inconsistencies; a failed job leaves the last site intact.
players.sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));
teams.sort((a, b) => String(a.teamId).localeCompare(String(b.teamId)));
trades.sort((a, b) => String(a.tradeId).localeCompare(String(b.tradeId)));
const payload = { league: configs[0], teams, players, trades };
const snapshotId = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
const snapshot = snapshotSchema.parse({
  ...payload,
  schemaVersion: 1,
  rulesVersion: "ymffl-2026-v1",
  snapshotId,
  capturedAt: started,
  source: "foundry",
});
await mkdir("website/public/data", { recursive: true });
const destination = "website/public/data/snapshot.json";
await writeFile(destination + ".tmp", JSON.stringify(snapshot, null, 2) + "\n", { flag: "w" });
await rename(destination + ".tmp", destination);
console.log(
  `Validated snapshot: ${players.length} players, ${teams.length} teams, ${trades.length} trades. No Foundry edits performed.`,
);
