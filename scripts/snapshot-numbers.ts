// SDK/API Long values can arrive as decimal strings. Normalize ONLY the known
// numeric fields at the export boundary; keep the public JSON schema strict.
const numericFields = {
  league: [
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
  teams: ["budgetAdjustment", "keeperSpend", "keeperCount", "remainingBudget"],
  players: ["positionRank", "auctionValue", "keeperCost", "overrideValue", "fantasyPoints"],
  trades: ["amount"],
} as const;
const optionalPlayerNumbers = new Set(["positionRank", "fantasyPoints"]);
const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function numberValue(value: unknown, path: string): unknown {
  // Missing required values must still be rejected by the snapshot schema.
  if (value === undefined || value === null) {
    return value;
  }
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() !== value || !decimal.test(value))
  ) {
    throw new Error(`Invalid numeric field at ${path}. Previous snapshot was not replaced.`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
    throw new Error(
      `Non-finite or unsafe numeric field at ${path}. Previous snapshot was not replaced.`,
    );
  }
  return number;
}
function normalizeRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
  player = false,
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  for (const field of fields) {
    if (!(field in record)) {
      continue;
    }
    record[field] =
      player && optionalPlayerNumbers.has(field) && record[field] === null
        ? undefined
        : numberValue(record[field], `${path}.${field}`);
  }
  return record;
}
export function normalizeSnapshotNumbers(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...payload };
  result.league = normalizeRecord(payload.league, numericFields.league, "league");
  for (const section of ["teams", "players", "trades"] as const) {
    const rows = payload[section];
    result[section] = Array.isArray(rows)
      ? rows.map((row, index) =>
          normalizeRecord(
            row,
            numericFields[section],
            `${section}.${index}`,
            section === "players",
          ),
        )
      : rows;
  }
  return result;
}
