import { z } from "zod";
import { type Snapshot, snapshotSchema } from "./model";

const year = z.number().int().min(2000).max(9999);
// Files are relative to data/, never remote URLs or paths outside the publication.
const cycleSchema = z.object({
  leagueId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  keeperYear: year,
  statsYear: z.number().int().min(1999).max(9998),
  label: z.string(),
  snapshotId: z.string().min(1),
  source: z.enum(["foundry", "demo"]),
  file: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-f0-9]{20}\.json$/),
});
export const cycleLabel = (keeperYear: number) =>
  `${keeperYear - 1}–${String(keeperYear).slice(-2)}`;
export function cycleMetadata(s: Snapshot) {
  return {
    leagueId: s.league.leagueId,
    keeperYear: s.league.season,
    statsYear: s.league.season - 1,
    label: cycleLabel(s.league.season),
    snapshotId: s.snapshotId,
    source: s.source,
  };
}
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaultLeagueId: z.string().min(1),
    cycles: z.array(cycleSchema).min(1).max(100),
  })
  .superRefine((m, ctx) => {
    if (new Set(m.cycles.map((c) => c.leagueId)).size !== m.cycles.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate league in manifest" });
    }
    const newest = [...m.cycles].sort((a, b) => b.keeperYear - a.keeperYear)[0];
    if (!newest || m.defaultLeagueId !== newest.leagueId) {
      ctx.addIssue({ code: "custom", message: "The default cycle must be the newest" });
    }
    for (const c of m.cycles) {
      if (
        c.statsYear !== c.keeperYear - 1 ||
        c.label !== cycleLabel(c.keeperYear) ||
        !c.file.startsWith(`${c.leagueId}.`)
      ) {
        ctx.addIssue({ code: "custom", message: "Inconsistent cycle metadata" });
      }
    }
  });
export type Manifest = z.infer<typeof manifestSchema>;
export type Cycle = Manifest["cycles"][number];
export type Catalog = {
  defaultLeagueId: string;
  cycles: Array<Omit<Cycle, "file"> & { file: string; inlineSnapshot?: Snapshot }>;
};
export function validateCycleSnapshot(raw: unknown, cycle: Catalog["cycles"][number]): Snapshot {
  const s = snapshotSchema.parse(raw);
  const actual = cycleMetadata(s);
  if (Object.entries(actual).some(([key, value]) => cycle[key as keyof typeof actual] !== value)) {
    throw new Error("Snapshot does not match its published cycle. No scenario has been changed.");
  }
  return s;
}
export async function loadCatalog(base: string): Promise<Catalog> {
  const response = await fetch(`${base}data/manifest.json`, { cache: "no-store" });
  // Old single-file deployments have no manifest. SPA dev hosts can return index.html for 404s.
  if (
    response.status === 404 ||
    (response.ok && response.headers.get("content-type")?.includes("text/html"))
  ) {
    const legacy = await fetch(`${base}data/snapshot.json`, { cache: "no-store" });
    if (!legacy.ok) {
      throw new Error("The league snapshot could not be loaded.");
    }
    const s = snapshotSchema.parse(await legacy.json());
    return {
      defaultLeagueId: s.league.leagueId,
      cycles: [{ ...cycleMetadata(s), file: "snapshot.json", inlineSnapshot: s }],
    };
  }
  if (!response.ok) {
    throw new Error("The cycle catalog could not be loaded.");
  }
  const manifest = manifestSchema.parse(await response.json());
  return { ...manifest, cycles: [...manifest.cycles].sort((a, b) => b.keeperYear - a.keeperYear) };
}
export async function loadCycle(base: string, cycle: Catalog["cycles"][number]): Promise<Snapshot> {
  if (cycle.inlineSnapshot) {
    return cycle.inlineSnapshot;
  }
  const response = await fetch(`${base}data/${cycle.file}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("This cycle's snapshot could not be loaded.");
  }
  return validateCycleSnapshot(await response.json(), cycle);
}
