import { describe, expect, it } from "vitest";
import fixture from "../website/src/demo.fixture.json";
import { snapshotSchema } from "../website/src/model";
import { normalizeSnapshotNumbers } from "./snapshot-numbers";

const stringifyNumbers = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "number" ? String(item) : item,
    ),
  );
describe("SDK numeric wire serialization", () => {
  it("accepts a whole snapshot whose numeric properties arrive as strings", () => {
    const wire = {
      ...fixture,
      league: stringifyNumbers(fixture.league),
      teams: stringifyNumbers(fixture.teams),
      players: stringifyNumbers(fixture.players),
      trades: stringifyNumbers(fixture.trades),
    };
    expect(() => snapshotSchema.parse(wire)).toThrow();
    expect(snapshotSchema.parse(normalizeSnapshotNumbers(wire))).toEqual(
      snapshotSchema.parse(fixture),
    );
  });
  it("preserves existing numeric snapshots without mutating inputs", () => {
    const input = structuredClone(fixture);
    const before = JSON.stringify(input);
    expect(snapshotSchema.parse(normalizeSnapshotNumbers(input))).toEqual(
      snapshotSchema.parse(fixture),
    );
    expect(JSON.stringify(input)).toBe(before);
  });
  it("normalizes positionRank strings like the actual failed export", () => {
    const wire = structuredClone(fixture) as Record<string, unknown>;
    wire.players = fixture.players.map((p) => ({ ...p, positionRank: String(p.positionRank) }));
    const parsed = snapshotSchema.parse(normalizeSnapshotNumbers(wire));
    expect(parsed.players.map((p) => p.positionRank)).toEqual(
      fixture.players.map((p) => p.positionRank),
    );
  });
  it("does not turn numeric-looking identifiers or names into numbers", () => {
    const normalized = normalizeSnapshotNumbers({
      league: { leagueId: "2026", season: "2026" },
      teams: [{ teamId: "0012", teamName: "123", keeperCount: "3" }],
      players: [],
      trades: [],
    });
    expect(normalized.league).toEqual({ leagueId: "2026", season: 2026 });
    expect(normalized.teams).toEqual([{ teamId: "0012", teamName: "123", keeperCount: 3 }]);
  });
  it("accepts finite decimal points and fractional pricing rates", () => {
    const normalized = normalizeSnapshotNumbers({
      league: { eliteIncrease: "0.2" },
      players: [{ fantasyPoints: "123.45" }],
      teams: [],
      trades: [{ amount: "12" }],
    });
    expect(normalized.league).toEqual({ eliteIncrease: 0.2 });
    expect(normalized.players).toEqual([{ fantasyPoints: 123.45 }]);
    expect(normalized.trades).toEqual([{ amount: 12 }]);
  });
  it("treats explicitly null optional rank/points as absent, not zero", () => {
    const normalized = normalizeSnapshotNumbers({
      ...fixture,
      players: fixture.players.map((p) => ({
        ...p,
        positionRank: p.positionRank,
        fantasyPoints: null,
      })),
    });
    const parsed = snapshotSchema.parse(normalized);
    expect(parsed.players[0].fantasyPoints).toBeUndefined();
    const sparse = normalizeSnapshotNumbers({
      players: [{ positionRank: null, fantasyPoints: null }],
    });
    expect(sparse.players).toEqual([{ positionRank: undefined, fantasyPoints: undefined }]);
  });
  it.each([
    "",
    " ",
    " 12",
    "12 ",
    "12\n",
    "NaN",
    "Infinity",
    "12abc",
    "0x10",
    "01",
    "1,000",
    true,
    false,
    Infinity,
    NaN,
    "1e309",
    "9007199254740993",
  ])("rejects malformed/unsafe numeric field %s", (value) => {
    expect(() => normalizeSnapshotNumbers({ players: [{ positionRank: value }] })).toThrow(
      /players\.0\.positionRank/,
    );
  });
  it("still rejects missing required fields and invalid shapes", () => {
    expect(() =>
      snapshotSchema.parse(
        normalizeSnapshotNumbers({
          ...fixture,
          league: { ...fixture.league, rosterSize: undefined },
        }),
      ),
    ).toThrow();
    expect(() =>
      snapshotSchema.parse(normalizeSnapshotNumbers({ ...fixture, teams: "not an array" })),
    ).toThrow();
  });
  it("does not weaken integer, eligibility, pricing or reference validations", () => {
    expect(() =>
      snapshotSchema.parse(
        normalizeSnapshotNumbers({ ...fixture, league: { ...fixture.league, rosterSize: "25.5" } }),
      ),
    ).toThrow();
    const changed = structuredClone(fixture);
    changed.players[0].keeperCost += 1;
    expect(() => snapshotSchema.parse(normalizeSnapshotNumbers(changed))).toThrow();
  });
});
