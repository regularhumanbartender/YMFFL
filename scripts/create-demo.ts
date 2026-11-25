// Explicit development fixture generator. NEVER called by publication workflows.
import { type League, type Player, keeperCost, snapshotSchema } from "../website/src/model";
import { publishSnapshots } from "./publish-snapshots";

const league: League = {
  leagueId: "demo-2026",
  leagueName: "YMFFL Demo",
  season: 2026,
  baseBudget: 300,
  rosterSize: 25,
  minimumBid: 1,
  qbEliteRank: 5,
  rbEliteRank: 10,
  wrEliteRank: 10,
  teEliteRank: 3,
  eliteIncrease: 0.2,
  elitePremium: 10,
  eliteMinimum: 15,
  standardIncrease: 0.1,
  standardPremium: 0,
  standardMinimum: 10,
  defenseIncrease: 2,
  defenseMinimum: 2,
};
const names = ["Fourth & Forever", "Sunday Syndicate", "The Red Zone", "Waiver Wire FC"];
const football = [
  [
    "Josh Allen",
    "Saquon Barkley",
    "Bijan Robinson",
    "Justin Jefferson",
    "Puka Nacua",
    "Trey McBride",
    "Fred Warner",
    "Chris Boswell",
  ],
  [
    "Lamar Jackson",
    "Jahmyr Gibbs",
    "De'Von Achane",
    "Ja'Marr Chase",
    "Nico Collins",
    "Brock Bowers",
    "T.J. Watt",
    "Brandon Aubrey",
  ],
  [
    "Jayden Daniels",
    "Derrick Henry",
    "Jonathan Taylor",
    "CeeDee Lamb",
    "Malik Nabers",
    "George Kittle",
    "Roquan Smith",
    "Jake Elliott",
  ],
  [
    "Joe Burrow",
    "Ashton Jeanty",
    "James Cook",
    "Amon-Ra St. Brown",
    "Brian Thomas Jr.",
    "Sam LaPorta",
    "Myles Garrett",
    "Cameron Dicker",
  ],
];
const positions = ["QB", "RB", "RB", "WR", "WR", "TE", "IDP", "K"];
const players: Player[] = names.flatMap((_, t) =>
  football[t].map((name, i) => {
    const p: Player = {
      playerId: `demo-${t}-${i}`,
      teamId: `team-${t}`,
      playerName: name,
      position: positions[i],
      positionRank: i + t + 1,
      auctionValue: [28, 44, 31, 52, 19, 15, 4, 2][i],
      keeperCost: 0,
      keeperEligible: i !== 4,
      eligibilityNote: i === 4 ? "Expired contract — not eligible" : "Eligible",
      isKeeper: [0, 1, 5].includes(i),
      underContract: i === 5,
      contractLabel: i === 4 ? "Expired" : i === 5 ? "Under contract" : "Renewal eligible",
      overrideEnabled: false,
      overrideValue: 0,
      fantasyPoints: 370 - i * 27 + t * 9,
    };
    p.keeperCost = keeperCost(p, league);
    return p;
  }),
);
const teams = names.map((teamName, t) => {
  const teamId = `team-${t}`;
  const keepers = players.filter((p) => p.teamId === teamId && p.isKeeper);
  const keeperSpend = keepers.reduce((n, p) => n + p.keeperCost, 0);
  const budgetAdjustment = [10, -10, 0, 0][t];
  return {
    teamId,
    teamName,
    budgetAdjustment,
    keeperSpend,
    keeperCount: keepers.length,
    remainingBudget: league.baseBudget + budgetAdjustment - keeperSpend,
  };
});
const snapshot = snapshotSchema.parse({
  schemaVersion: 1,
  rulesVersion: "ymffl-2026-v1",
  snapshotId: "demo-v1",
  capturedAt: "2026-11-24T00:00:00Z",
  source: "demo",
  league,
  teams,
  players,
  trades: [],
});
await publishSnapshots([snapshot]);
console.log("Created clearly labeled demo fixture; no Foundry data was read.");
