import type { Client } from "@osdk/client";
import {
  YmfflAuctionTrade,
  YmfflKeeperPlayer,
  YmfflLeagueSettings,
  YmfflLeagueTeam,
} from "@ymffl-website/sdk";
import { describe, expect, it } from "vitest";
import next from "../website/src/demo-2027.fixture.json";
import old from "../website/src/demo.fixture.json";
import { readSnapshots } from "./read-snapshots";

// All data here is fictional. This mock intentionally yields many small pages, including
// rows on the final page; production asyncIter performs the actual OSDK pagination.
function fakeClient() {
  const fixtures = [old, next].map((s) => ({
    ...s,
    league: { ...s.league, leagueId: `ymffl-${s.league.season}` },
  }));
  const rows = new Map<unknown, Array<Record<string, unknown>>>([
    [YmfflLeagueSettings, fixtures.map((s) => ({ ...s.league, season: String(s.league.season) }))],
    [
      YmfflLeagueTeam,
      fixtures.flatMap((s) => s.teams.map((t) => ({ ...t, leagueId: s.league.leagueId }))),
    ],
    [
      YmfflKeeperPlayer,
      fixtures.flatMap((s) =>
        s.players.map((p) => ({
          ...p,
          playerId: `${s.league.leagueId}:${p.playerId}`,
          leagueId: s.league.leagueId,
          auditUser: "NEVER PUBLIC",
        })),
      ),
    ],
    [YmfflAuctionTrade, []],
  ]);
  const filters: unknown[] = [];
  const selections: string[][] = [];
  let pages = 0;
  const client = ((type: unknown) => ({
    where: (filter: { leagueId: { $eq?: string; $startsWith?: string } }) => {
      filters.push(filter);
      return {
        asyncIter: async function* ({ $select }: { $select: string[] }) {
          selections.push($select);
          const data = rows
            .get(type)!
            .filter((r) =>
              filter.leagueId.$eq
                ? r.leagueId === filter.leagueId.$eq
                : String(r.leagueId).startsWith(filter.leagueId.$startsWith!),
            );
          for (let offset = 0; offset < data.length; offset += 5) {
            pages++;
            for (const row of data.slice(offset, offset + 5)) {
              yield row;
            }
          }
        },
      };
    },
  })) as unknown as Client;
  return { client, filters, selections, getPages: () => pages };
}
describe("current-object read-only multi-league exporter", () => {
  it("reads all configs and each league's complete teams/players/trades, not just the first page", async () => {
    const mock = fakeClient();
    const result = await readSnapshots(mock.client, "all", "2026-11-24T00:00:00Z");
    expect(result.map((s) => s.league.leagueId)).toEqual(["ymffl-2026", "ymffl-2027"]);
    expect(result.map((s) => s.players.length)).toEqual([32, 32]);
    expect(mock.getPages()).toBeGreaterThan(10);
    expect(mock.filters).toContainEqual({ leagueId: { $eq: "ymffl-2027" } });
    expect(mock.selections.every((fields) => !fields.includes("auditUser"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("NEVER PUBLIC");
    expect(result[1].league.season).toBe(2027);
  });
  it("exports a selected league without leaking the other cycle", async () => {
    const mock = fakeClient();
    const result = await readSnapshots(mock.client, "ymffl-2027", "2026-11-24T00:00:00Z");
    expect(result).toHaveLength(1);
    expect(result[0].league.leagueId).toBe("ymffl-2027");
    expect(mock.filters).toHaveLength(4);
    expect(mock.filters.every((f) => JSON.stringify(f).includes("ymffl-2027"))).toBe(true);
  });
  it("refuses to publish an unavailable selected cycle", async () => {
    const mock = fakeClient();
    await expect(readSnapshots(mock.client, "ymffl-2028", "2026-11-24T00:00:00Z")).rejects.toThrow(
      /No league/,
    );
  });
});
