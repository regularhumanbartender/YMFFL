# YMFFL — The Keeper Lab

Mobile-first public roster, auction-budget dashboard, and local keeper / player-and-auction-dollar trade simulator. **No visitor accounts, no live backend, no Foundry writes.**

## Delivery status and activation

- The original GitHub Pages site at `regularhumanbartender/YMFFL` is already live. Its owner manually published real 2026 data (12 teams, 292 players, no recorded trades at that export). This Foundry repository is **not automatically connected to GitHub** and does not contain that newer public JSON.
- This repository's checked-in publication remains the original **clearly labeled 2026 demo**. Its new manifest lists only that available cycle. The fictional 2027 fixture is test-only, **not published**. No real 2027 data has been fabricated or exported here.
- Multi-year source, exporter, and workflow changes must be transferred to GitHub after review/Foundry deployment. **Never overwrite the live real snapshot with this repository's demo data.** Follow the transfer steps below.
- Daily refresh still requires separate read-only service credentials and explicit enablement. The frontend's public OAuth client ID is not a backend-service credential. Never put secrets in the browser.

## Cycle semantics

| League key   | Dropdown label | Stats year | Keeper year (`league.season`) |
| ------------ | -------------- | ---------- | ----------------------------- |
| `ymffl-2026` | 2025–26        | 2025       | 2026                          |
| `ymffl-2027` | 2026–27        | 2026       | 2027                          |

Existing 2026 data is **not relabeled as 2027**. The backend has no separate stats-year property; publication derives it as keeper year minus one. The dropdown lists only cycles actually present in the published manifest and defaults to the newest. It is usable with a single cycle. Demo entries carry a Demo suffix and the preview warning remains visible.

Selecting a cycle loads its own immutable snapshot. Team, filters, tabs, and simulation mode reset; the selected baseline starts read-only. Returning to the simulator restores only that cycle's scenario for that **exact snapshot ID**. No keeper decisions or trades migrate between years or changed baselines.

## Layout

| Path                                             | Purpose                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `website/`                                       | Independent public React + TypeScript + Vite package; public npm dependencies only |
| `website/public/data/manifest.json`              | Catalog of available cycles; published last                                        |
| `website/public/data/<leagueId>.<fileHash>.json` | Immutable, allowlisted, validated cycle snapshots                                  |
| `website/public/data/snapshot.json`              | Backwards-compatible alias for the newest default cycle                            |
| `website/src/catalog.ts`                         | Manifest validation, cycle labels, static loading and singleton fallback           |
| `website/src/model.ts`                           | Strict snapshot schema, pricing, budgets and scenario storage                      |
| `website/src/demo*.fixture.json`                 | Deterministic tests; fictional 2027 fixture is never public data                   |
| `scripts/export-snapshot.ts`                     | Node-only authentication and export entry point                                    |
| `scripts/read-snapshots.ts`                      | Current-object, paginated, read-only OSDK reader                                   |
| `scripts/publish-snapshots.ts`                   | Validate all, hash immutable files, write alias and manifest                       |
| `.github/workflows/pages.yml`                    | Public build/deploy and optional daily refresh                                     |
| `src/main.tsx`                                   | Foundry development entry point for the same website                               |

The browser import graph contains no Foundry OAuth or OSDK code. It fetches only same-origin static JSON under Vite's base path. No Yahoo requests or credentials are needed. The private SDK remains publisher-only, with its existing four read-only object imports; no actions are imported.

## Run and verify

Use Node 22 or a newer supported LTS. The standalone site requires no Foundry credentials:

```sh
cd website
npm ci
npm run dev
npm test
npm run build
```

For a GitHub project site set `SITE_BASE_PATH=/YMFFL/` when building. Assets, manifest and cycle files respect this base. No deep-route rewrites are needed.

Within the configured Foundry checkout, preserve the root template's branch plugin and `postinstall` SDK synchronization. Install using the configured artifact registry, then:

```sh
npm test
npm run lint
npm run typecheck:publisher
npm run build
npm --prefix website test
SITE_BASE_PATH=/YMFFL/ npm --prefix website run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/user/.cache/ms-playwright/chromium-1256/chrome-linux64/chrome npm run test:e2e
```

Otherwise install Chromium with `npx playwright install chromium`. Tests cover desktop, mobile and 320px width under `/YMFFL/`, the legacy singleton, two mocked years, default-newest selection, isolated keeper/trade scenarios, failed-cycle recovery, no network writes, validation-before-publication and paginated current-object exports. Never commit browser reports, builds or credentials.

## Static output contract

`data/manifest.json` has this shape (**illustrative future contract**, not a statement that real 2027 is available; hashes below are examples):

```json
{
  "schemaVersion": 1,
  "defaultLeagueId": "ymffl-2027",
  "cycles": [
    {
      "leagueId": "ymffl-2027",
      "keeperYear": 2027,
      "statsYear": 2026,
      "label": "2026–27",
      "snapshotId": "a-content-baseline-id",
      "source": "foundry",
      "file": "ymffl-2027.0123456789abcdef0123.json"
    },
    {
      "leagueId": "ymffl-2026",
      "keeperYear": 2026,
      "statsYear": 2025,
      "label": "2025–26",
      "snapshotId": "another-content-baseline-id",
      "source": "foundry",
      "file": "ymffl-2026.abcdef0123456789abcd.json"
    }
  ]
}
```

- `file` is a safe relative filename under `data/`, never an external URL or parent-directory path. Manifest fields must match the selected snapshot's league ID, keeper year, source and baseline ID. Invalid/mismatched data fails closed, with retry and the year selector still available.
- Per-cycle JSON preserves snapshot schema version 1: `schemaVersion`, `rulesVersion`, `snapshotId`, `capturedAt`, `source`, `league`, `teams`, `players`, `trades`. `league.season` is the keeper year. The pricing algorithm remains `rulesVersion: "ymffl-2026-v1"` for both cycles because the rules are unchanged; this is not a display-year label.
- `snapshotId` hashes normalized league content, independently for each cycle. An identical baseline retains its ID. Filename hashes include the entire JSON, including capture time, so a previous manifest can continue to reference its exact bytes. Keep earlier immutable files when copying/deploying data.
- `snapshot.json` contains the same snapshot as the manifest's newest default, for older clients.
- If `manifest.json` is absent (404, or an SPA host returning HTML), the app reads only `snapshot.json`, derives its label from `snapshot.league.season`, and exposes a **single read-only baseline** plus its local what-if simulator. It does not invent other years. An existing malformed manifest or a non-404 server error is not silently ignored.

## Manual export of actual current data

Wait until the intended league objects are deployed and indexed in Foundry. Export from a reviewed/updated Foundry clone, **not from an old exporter copied to GitHub**. The publisher reads current objects (including commissioner edits), not the original workbook or datasets.

1. Install Node 22 LTS. Create a **short-lived Foundry API token** with your existing read access to the four league object types and private SDK artifact. A Git clone token, GitHub token, public OAuth ID or artifacts-only token is not a replacement. Do not paste credentials into chat, files or command arguments.
2. At the clone's root run:

   ```sh
   bash scripts/export-manual.sh
   ```

   Default selection is **all** current `ymffl-YYYY` league configurations, using paginated OSDK iteration. To export only one cycle instead:

   ```sh
   FOUNDRY_LEAGUE_ID=ymffl-2027 bash scripts/export-manual.sh
   ```

   A selected export retains and validates the other cycles already in the local data directory; an `all` export rebuilds the catalog from all accessible current YMFFL configurations. For a selected export, first copy the real current GitHub data directory into the local clone to avoid retaining an outdated local demo instead of the real historical cycle. All is preferred for the first multi-year export.

3. Paste the API token at the hidden prompt. The helper refuses CI/noninteractive use, installs dependencies without lifecycle scripts, validates **all** snapshots before publication, writes hash-named files, updates the latest alias, then atomically replaces the manifest **last**. It does not commit, upload or edit Foundry. Revoke the token afterward.
4. Check each league's counts, names, keeper year, timestamp and `source: "foundry"`. For 2026, compare with the known 12-team/292-player baseline (counts may legitimately change). Confirm 2027 only after its actual objects exist. A missing selected cycle or invalid cycle aborts without replacing the prior publication. There is no fallback to demo data.
5. Transfer the successful publication as one unit per the next section. Do not copy only `snapshot.json` while leaving an older manifest active.

The helper defaults to this repository's configured HTTPS enrollment and ontology; non-secret environment variables may override them. If artifact download gives 401/403, check access rather than granting broad roles or exposing tokens in logs. Manual user tokens are deliberately rejected in CI.

## Transfer to the existing GitHub repository — preserve real data

### Safe Mac source-archive method (code only)

**This player-trade feature is not live on GitHub.** No actual exports, Main writes, tokens, GitHub credentials, pushes or releases were performed for this frontend task. After source review/merge, a code-only deployment can keep the existing real 2026 singleton; real 2027 becomes available only after an actual all-cycle export following Main deployment/indexing.

In the reviewed, updated Foundry clone, inspect `git status --short` and `git log -n 3 --oneline` first. Verify the intended reviewed commit; stop and preserve unrelated work. Make an allowlisted archive, deliberately excluding **all `website/public/data/`**, `.git/`, `.env*`, credentials, dependencies and builds. Do not copy the entire Foundry source ZIP over the GitHub checkout.

```sh
# From the reviewed Foundry clone, AFTER the feature source is reviewed/merged.
git archive --format=tar --output="$HOME/Desktop/ymffl-reviewed-source.tar" HEAD \
  website/src website/package.json website/package-lock.json website/.npmrc \
  website/index.html website/vite.config.ts website/tsconfig.json website/public/favicon.svg \
  scripts e2e .github/workflows/pages.yml README.md playwright.config.ts \
  package.json package-lock.json .npmrc .gitignore eslint.config.mjs \
  src public/resources.json index.html vite.config.ts tsconfig.json tsconfig.node.json
tar -tf "$HOME/Desktop/ymffl-reviewed-source.tar"
# Inspect: NO website/public/data/, .env*, .git/, credentials or builds may appear.
```

In a separate Terminal tab, open the existing `regularhumanbartender/YMFFL` GitHub clone and update its normal default branch using your usual process. Run `git status --short`; stop if there are any uncommitted changes and preserve/review them first. Never reset the local checkout or remote history, force-checkout, or blindly overwrite local work. With a clean worktree:

```sh
# From the existing GitHub clone root. Back up real data OUTSIDE the checkout.
cp -R website/public/data "$HOME/Desktop/ymffl-data-backup-$(date +%Y%m%d-%H%M%S)"
tar -xf "$HOME/Desktop/ymffl-reviewed-source.tar" -C .
git diff -- website/public/data/
# MUST be empty: leave the real snapshot.json and any existing manifest untouched.
npm --prefix website ci
npm --prefix website test
SITE_BASE_PATH=/YMFFL/ npm --prefix website run build
git diff --check
git status --short
```

Review and stage only the transferred source paths, excluding data, environment files and builds; commit normally. Push only when you are ready, with your existing GitHub setup (no credentials in code). Pages should use **GitHub Actions**. A code-only rollout with no manifest falls back to the existing real `snapshot.json`. Do not run `create-demo` and do not add the Foundry demo manifest.

### Package only validated real publication files after the actual export

After intended Main data is deployed/indexed, in the updated Foundry clone run `FOUNDRY_LEAGUE_ID=all bash scripts/export-manual.sh`. This helper already defaults to `all`; explicitly setting it avoids an old shell setting of `ymffl-2026`. Use the hidden read-only token prompt, revoke afterward, and check actual counts/names/years before proceeding. Never relabel 2026 as 2027 or substitute fixtures if a real cycle is unavailable.

After the successful export, the following local-only validation builds an archive containing **only the real manifest, alias and manifest-referenced immutable files**, not unreferenced demo files. All checks complete before the archive is created. It makes no network requests or Foundry edits.

```sh
# Still in the updated Foundry clone root, AFTER the successful real export.
node --import tsx --input-type=module <<"NODE"
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { manifestSchema, validateCycleSnapshot } from "./website/src/catalog.ts";
import { snapshotSchema } from "./website/src/model.ts";
const directory = "website/public/data";
const read = (name) => JSON.parse(readFileSync(`${directory}/${name}`, "utf8"));
const manifest = manifestSchema.parse(read("manifest.json"));
const snapshots = manifest.cycles.map((cycle) => {
  const snapshot = validateCycleSnapshot(read(cycle.file), cycle);
  if (snapshot.source !== "foundry") throw new Error(`Refusing demo: ${cycle.leagueId}`);
  console.log(cycle.leagueId, cycle.label, snapshot.teams.length, "teams", snapshot.players.length, "players", snapshot.capturedAt);
  return snapshot;
});
const alias = snapshotSchema.parse(read("snapshot.json"));
const latest = snapshots.find((s) => s.league.leagueId === manifest.defaultLeagueId);
if (JSON.stringify(alias) !== JSON.stringify(latest)) throw new Error("Latest alias mismatch");
const archive = resolve("../ymffl-real-publication.tar");
execFileSync("tar", ["-cf", archive, "-C", directory,
  "snapshot.json", "manifest.json", ...manifest.cycles.map((c) => c.file)]);
console.log("Validated real publication only:", archive);
NODE
```

Transfer the printed archive (next to the Foundry clone) to the Mac. Inspect `tar -tf /path/to/ymffl-real-publication.tar`; only the alias, manifest and referenced real JSON files may appear. In the GitHub clone, start from a clean worktree after the source commit, preserve the backup, and substitute the actual archive path:

```sh
tar -xf /path/to/ymffl-real-publication.tar -C website/public/data
# Keep existing immutable history. Do NOT delete/recreate the data directory.
git diff -- website/public/data/
npm --prefix website test
SITE_BASE_PATH=/YMFFL/ npm --prefix website run build
git diff --check
git add -- website/public/data
git diff --cached --stat
# Inspect the complete staged JSON diff too, then commit the whole publication together.
git commit -m "Publish validated current YMFFL keeper cycles"
```

Review the real sources, labels, counts, timestamp and file references before your normal manual push. **Alias + manifest + referenced new immutable files belong in one data commit.** Do not copy only the alias while an older manifest is active. No automatic GitHub push or credentials are configured here.

### Targeted validation/test dependency security patch

Both root and standalone `website/` manifests pin **Zod 4.6.7** and **Vitest 5.1.1**. Both regenerated lockfiles and installed trees resolve `@vitest/mocker` **5.1.1** and contain **no `tinypool`**. These versions are outside the reported affected ranges (Zod `<4.6.6`, mocker `<=4.1.11`, tinypool `<=2.1.1`). No dependency overrides or forced audit fixes are used. Vitest supports Node `^22.12.0 || ^24.0.0 || >=26.0.0`; the existing repository Node 24 configuration and Vite 7 releases are compatible, so no template/runtime upgrade is required.

The Zod 4 change explicitly declares string keys and boolean values for keeper records. Snapshot schema v1, pricing rules and strict local-plan v2 envelopes/keys remain unchanged; there is no new data or storage migration. The standalone site explicitly declares/enables Node types for its existing `node:fs` publication test rather than relying on Vitest's former ambient type references. Twenty added validation regressions supplement all existing tests. Verified: root build/lint/typecheck/publisher typecheck and **173 unit tests**, standalone **126 unit tests** and `/YMFFL/` production build, plus all **33 Playwright cases** across desktop, mobile and 320px mobile.

**Audit status is unverified, not zero vulnerabilities:** this workspace's public npm audit request failed with `getaddrinfo ENOTFOUND registry.npmjs.org`; the Foundry registry proxy's advisory endpoint returned HTTP 404. Resolved package inspection found no Zod 3 in either lockfile/installed dependency tree, including root transitive dependencies, but that is not a complete advisory scan or a guarantee about private SDK packages. Re-run `npm audit` on the Mac before a manual GitHub push. Installation warned about an unapproved `esbuild@0.28.2` postinstall; builds passed without approving it. Review any future install-script prompt for its exact package/version; do not globally approve scripts or disable security checks. Production builds also emit harmless upstream Zod comment-annotation warnings; no rules or scanners were suppressed.

If the reviewed player-trade source and both real cycles are **already copied into the GitHub checkout**, preserve that uncommitted work and copy **only these eight patch files** from the reviewed/merged source, maintaining their paths:

```text
package.json
package-lock.json
website/package.json
website/package-lock.json
website/tsconfig.json
website/src/model.ts
website/src/validation.test.ts
README.md
```

Do not re-copy source directories, `website/public/data/`, environment files, node_modules or build output. Do not regenerate demos, repeat the real exports or re-extract an older archive. The already-extracted real alias, manifest and immutable cycle JSON must remain intact. After copying, from the GitHub checkout run:

```sh
npm --prefix website ci
npm --prefix website ls zod vitest @vitest/mocker tinypool --all
npm --prefix website audit
npm --prefix website test
SITE_BASE_PATH=/YMFFL/ npm --prefix website run build
git diff --check
git diff -- website/public/data/
```

An audit failure, new advisory or install failure needs review before pushing; do not use `npm audit fix --force`. Check that the data diff is still the intended previously exported real publication, not demo replacements. Review/stage source and the real publication deliberately; do not reset/clean the checkout or use a blanket copy/commit to discard existing work. Root installation remains separate and still runs `osdk branch sync`; the standalone browser never imports Foundry auth/SDK or gains a write API.

### Activation checklist

Nothing in this task pushes to GitHub or replaces the owner's live JSON.

1. After review/Foundry merge, update the local Foundry clone to the reviewed source. Separately update the local `regularhumanbartender/YMFFL` clone's default branch. Back up its entire `website/public/data/` outside the checkout before copying anything.
2. Transfer the reviewed frontend/publisher source and workflow changes: `website/src/`, `scripts/`, `e2e/`, `.github/workflows/pages.yml`, `README.md`, `playwright.config.ts`, and any required root package/config files (`package.json`, `package-lock.json`, `.npmrc`, `.gitignore`, `eslint.config.mjs`). Preserve the independent `website/package.json`, `website/package-lock.json`, Vite/TS configuration and static non-data assets from the reviewed source. **Exclude `website/public/data/` on this code-only copy**, along with node_modules, build output and environment/credential files. Do not regenerate demo data.
3. For a code-only rollout, leave the existing real `snapshot.json` untouched and do not add this repository's demo manifest. The new frontend will use the single-file fallback and show 2025–26 derived from keeper year 2026. Run `npm --prefix website ci`, `npm --prefix website test`, and `SITE_BASE_PATH=/YMFFL/ npm --prefix website run build`. Commit the reviewed source/workflow separately from data. GitHub **Settings → Pages → Source** should be GitHub Actions.
4. Once real 2027 is deployed/indexed, run the updated manual helper with `FOUNDRY_LEAGUE_ID=all` in the Foundry clone. Only after successful validation, copy its new hash-named JSON files, `snapshot.json` alias, and `manifest.json` into the GitHub clone's data directory. Retain existing immutable history. If uploading outside an atomic Git deployment, upload cycle files first, alias second, **manifest last**.
5. Review `git diff -- website/public/data/` and the manifest. It should list the actual available cycles, `source: "foundry"`, expected labels and matching files. Re-run standalone tests/build, then commit and push the full validated data change to the GitHub default branch. Never push this repository's demo manifest over the real publication.
6. Wait for the Pages workflow to finish. Confirm the dropdown offers 2025–26 and 2026–27 only when both were actually exported; verify each roster/budget, timestamp, stats→keepers text and absence of the demo banner. Change a hypothetical keeper in one year, switch years, and verify independent scenarios. Foundry application releases do not deploy GitHub Pages.

## Optional daily publication

Create a **separate Developer Console backend-service application using application permissions** with only the required object reads. Keep existing project/operation restrictions; no action submission, writeback or broadened scopes are needed. The publisher requests only `api:use-ontologies-read`. Its service user (or a separate least-privilege artifact credential) must download the stable `@ymffl-website/sdk` artifact. Do not use the frontend's public OAuth client as a service client.

Set these in GitHub Actions settings, never browser environment variables:

| Kind     | Name                    | Value                                                                            |
| -------- | ----------------------- | -------------------------------------------------------------------------------- |
| Variable | `FOUNDRY_URL`           | HTTPS Foundry origin                                                             |
| Variable | `FOUNDRY_ONTOLOGY_RID`  | League ontology RID                                                              |
| Variable | `FOUNDRY_LEAGUE_ID`     | `all` (also the default when unset/empty), or one exact key such as `ymffl-2027` |
| Secret   | `FOUNDRY_CLIENT_ID`     | Dedicated backend-service client ID                                              |
| Secret   | `FOUNDRY_CLIENT_SECRET` | Backend-service secret                                                           |
| Secret   | `FOUNDRY_NPM_TOKEN`     | Private SDK artifact download credential                                         |
| Variable | `ENABLE_DAILY_SNAPSHOT` | `true` only after a successful manual refresh                                    |

Remove an old hardcoded `FOUNDRY_LEAGUE_ID=ymffl-2026` setting or change it to `all` to activate multi-year daily refreshes. Run **Actions → Public site and daily snapshot → Run workflow → refresh_snapshot = true** on the default branch, inspect both cycles, then enable the daily variable. The workflow commits **all** publication JSON, including the manifest and immutable files, so later source deployments do not restore demos. Permit the bot's data commit under your branch policy. Pull-request builds never receive Foundry secrets.

The schedule is 09:17 UTC daily, subject to GitHub delays/inactivity policies. It is not a live feed or an exact 24-hour SLA. Enable failure notifications and inspect timestamps; the UI warns on real snapshots older than 30 hours. A failed export/test/build does not deploy a replacement site.

## Safety and simulation rules

- Explicit field allowlists exclude user/audit identities, manager information, arbitrary notes, object metadata and secrets. Numeric normalization accepts only valid finite/safe numbers or strict numeric strings in known numeric fields; identifiers and booleans are never coerced. Optional null ranks/points remain absent.
- Strict schemas reject duplicate IDs, broken references, unsupported versions, invalid pricing/eligibility and inconsistent team totals. Cross-type reads are not one transaction; retry after commissioner edits if consistency validation fails. Validate every incoming and retained cycle before writing any publication files.
- The open tab pins its catalog and snapshots; no background refresh silently changes a scenario. Explicit refresh loads the new publication. Storage keys include league ID **and** snapshot ID. The original 2026 legacy key is read only for its exact original 2026 snapshot; there is no cross-year or changed-baseline migration. Old local storage is retained, but there is no archived-scenario browser.
- Published recorded transfers are already in net budget adjustments: never apply them twice. Hypothetical transfers conserve league dollars and player IDs. Cash is optional, nonnegative whole dollars; an empty zero-dollar package is rejected. The official positive-cash ledger and public JSON schema stay unchanged.
- Player-only, cash-only and combined packages allow multiple players on either side, including unbalanced packages and either cash direction. Ordered ownership replay drives all simulated rosters, counts, keeper spend and budget metrics. Keeper decisions follow player IDs; no automatic Keep, price, contract, eligibility or points-rank changes occur. Published always uses the original source ownership.
- Player moves may leave a team underfunded or over the keeper limit; the UI flags deficits rather than inventing dollars. New cash is checked against the sending team after both player legs and previous cash changes. Accepted history survives later keeper toggles that create deficits. Removing an earlier ownership dependency is blocked; remove dependent later moves first. No later trades are silently dropped.
- Eligibility, contract locks, overrides, elite/standard pricing, rounding, roster size and minimum-bid reserve remain unchanged. New pricing rules require a new rules version and parity tests.
- Local plans use `ymffl:scenario:v2:<leagueId>:<snapshotId>` and a strict `{version:2, leagueId, snapshotId, keepers, trades}` envelope. Legacy cash-only plans are copied from the exact cycle/baseline key (or original 2026 key only); old keys are never overwritten. Old clients cannot discard player legs in the new key. Malformed plans fail entirely closed with a notice, never partial replay. Reset writes an empty v2 plan for the current cycle only so legacy plans cannot resurrect.
- Scenarios remain device/browser-local. Nothing is submitted to Foundry; no accounts, cross-device sync or scenario-sharing backend are introduced.
