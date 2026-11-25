// Node-only publication boundary. Never import into website/src.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Manifest,
  cycleMetadata,
  manifestSchema,
  validateCycleSnapshot,
} from "../website/src/catalog";
import { type Snapshot, snapshotSchema } from "../website/src/model";
import { normalizeSnapshotNumbers } from "./snapshot-numbers";

export const selectionFromEnv = (value?: string) => {
  const selection = value || "all";
  if (selection !== "all" && !/^ymffl-\d{4}$/.test(selection)) {
    throw new Error("FOUNDRY_LEAGUE_ID must be 'all' or an exact ymffl-YYYY league ID.");
  }
  return selection;
};
export function buildSnapshot(payload: Record<string, unknown>, capturedAt: string): Snapshot {
  const normalized = normalizeSnapshotNumbers(payload);
  const snapshotId = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 20);
  const validation = snapshotSchema.safeParse({
    ...normalized,
    schemaVersion: 1,
    rulesVersion: "ymffl-2026-v1",
    snapshotId,
    capturedAt,
    source: "foundry",
  });
  if (!validation.success) {
    const details = validation.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Snapshot validation failed (${validation.error.issues.length} issues). Previous publication was not replaced.\n${details}`,
    );
  }
  return validation.data;
}
async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
async function existingSnapshots(directory: string): Promise<Snapshot[]> {
  const raw = await optionalRead(join(directory, "manifest.json"));
  if (raw !== undefined) {
    const manifest = manifestSchema.parse(JSON.parse(raw));
    return Promise.all(
      manifest.cycles.map(async (cycle) =>
        validateCycleSnapshot(
          JSON.parse(await readFile(join(directory, cycle.file), "utf8")),
          cycle,
        ),
      ),
    );
  }
  const legacy = await optionalRead(join(directory, "snapshot.json"));
  return legacy === undefined ? [] : [snapshotSchema.parse(JSON.parse(legacy))];
}
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
async function atomicWrite(path: string, contents: string) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, contents, { flag: "wx" });
  await rename(temp, path);
}
export async function publishSnapshots(
  inputs: unknown[],
  { directory = "website/public/data", selection = "all" } = {},
): Promise<Manifest> {
  // Validate EVERY input and every retained cycle before creating or replacing any file.
  const incoming = inputs.map((s) => snapshotSchema.parse(s));
  if (
    !incoming.length ||
    new Set(incoming.map((s) => s.league.leagueId)).size !== incoming.length
  ) {
    throw new Error(
      "Expected one or more unique league snapshots. Previous publication was not replaced.",
    );
  }
  if (selection !== "all" && (incoming.length !== 1 || incoming[0].league.leagueId !== selection)) {
    throw new Error("Selected league does not match export.");
  }
  const previous = selection === "all" ? [] : await existingSnapshots(directory);
  const snapshots = [
    ...incoming,
    ...previous.filter(
      (s) =>
        !incoming.some(
          (n) =>
            n.league.leagueId === s.league.leagueId ||
            (s.source === "demo" && n.source === "foundry" && n.league.season === s.league.season),
        ),
    ),
  ].sort(
    (a, b) =>
      b.league.season - a.league.season || a.league.leagueId.localeCompare(b.league.leagueId),
  );
  const files = snapshots.map((s) => {
    const contents = serialize(s);
    // The full-file hash includes capturedAt. Never rewrite a file an old manifest might reference.
    const hash = createHash("sha256").update(contents).digest("hex").slice(0, 20);
    return { file: `${s.league.leagueId}.${hash}.json`, contents, snapshot: s };
  });
  const manifest = manifestSchema.parse({
    schemaVersion: 1,
    defaultLeagueId: snapshots[0].league.leagueId,
    cycles: files.map(({ file, snapshot }) => ({ ...cycleMetadata(snapshot), file })),
  });
  // Reject any unlikely immutable-name collision before touching the publication.
  for (const f of files) {
    const current = await optionalRead(join(directory, f.file));
    if (current !== undefined && current !== f.contents) {
      throw new Error(
        "Immutable snapshot filename collision. Previous publication was not replaced.",
      );
    }
  }
  await mkdir(directory, { recursive: true });
  for (const f of files) {
    if ((await optionalRead(join(directory, f.file))) === undefined) {
      await atomicWrite(join(directory, f.file), f.contents);
    }
  }
  // Old clients get the newest default as an alias. Manifest is the final commit point for new clients.
  await atomicWrite(join(directory, "snapshot.json"), files[0].contents);
  await atomicWrite(join(directory, "manifest.json"), serialize(manifest));
  return manifest;
}
