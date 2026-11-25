// SERVER / SCHEDULED JOB ONLY. Never import into website/src.
import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";
import { publishSnapshots, selectionFromEnv } from "./publish-snapshots";
import { publisherAuth } from "./publisher-auth";
import { readSnapshots } from "./read-snapshots";

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
const config = publisherAuth(process.env, process.argv.includes("--manual"));
const ontologyRid = required("FOUNDRY_ONTOLOGY_RID");
const selection = selectionFromEnv(process.env.FOUNDRY_LEAGUE_ID);
let tokenProvider: () => Promise<string>;
if (config.mode === "manual") {
  tokenProvider = async () => config.token;
} else {
  const auth = createConfidentialOauthClient(config.clientId, config.clientSecret, url, [
    "api:use-ontologies-read",
  ]);
  await auth.signIn();
  tokenProvider = auth;
}
const client = createClient(url, ontologyRid, tokenProvider);
const snapshots = await readSnapshots(client, selection, new Date().toISOString());
const manifest = await publishSnapshots(snapshots, { selection });
for (const s of snapshots) {
  console.log(
    `Validated ${s.league.leagueId}: ${s.players.length} players, ${s.teams.length} teams, ${s.trades.length} trades.`,
  );
}
console.log(
  `Published ${manifest.cycles.length} cycle(s); default ${manifest.defaultLeagueId}. No Foundry edits performed.`,
);
