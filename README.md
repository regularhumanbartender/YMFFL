# YMFFL — The Keeper Lab

Mobile-first public roster, auction-budget dashboard, and local keeper / auction-dollar trade simulator. **No visitor accounts, no live backend, no Foundry writes.**

## Current delivery status

- Working website: `website/`. Four screens: roster, league budgets, trade lab, rules.
- The checked-in snapshot is **explicitly labeled demo data**, not an export of the league.
- Exporter and daily GitHub Actions workflow are implemented but **not connected to credentials or deployed to GitHub**.
- The existing public-client OAuth ID is NOT a backend-service credential. Do not put a secret into the frontend.

## Repository layout

| Path                                | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `website/`                          | Self-contained public React + TypeScript + Vite app; public npm dependencies only |
| `website/public/data/snapshot.json` | Published baseline; served as a static file                                       |
| `website/src/model.ts`              | Versioned schema, pricing, budgets, scenario logic                                |
| `website/src/model.test.ts`         | Rule, accounting, snapshot, and storage tests                                     |
| `scripts/export-snapshot.ts`        | Scheduled-job-only OSDK reader; explicit public field allowlist                   |
| `.github/workflows/pages.yml`       | Public build/deploy plus optional daily snapshot refresh                          |
| `src/main.tsx`                      | Foundry preview entry point for the same website                                  |
| root package / Vite config          | Foundry preview, private SDK, publisher and development tools                     |

The browser import graph contains no Foundry OAuth or Ontology SDK imports. The private SDK is required only for the scheduled publisher. No actions are imported into that SDK.

## Run the public site outside Foundry

Use Node 22 or newer supported LTS:

```sh
cd website
npm ci
npm run dev
npm test
npm run build
```

No Foundry credentials are needed for these commands. If running as a project site, set `SITE_BASE_PATH=/YMFFL/` for the build. Asset paths, snapshot fetches, and the favicon respect Vite's base path. There are no client-side deep routes that require GitHub Pages rewrites.

## Run within Foundry

Install dependencies using the repository's configured artifact registry, then:

```sh
npm run dev
npm run build
npm test
npm run lint
```

Preserve the root template's branch plugin and `postinstall` SDK sync for Foundry development. The standalone `website/` package intentionally does not depend on either of them.

## GitHub Pages setup

1. Transfer the reviewed source changes and both lockfiles to `regularhumanbartender/YMFFL`. This workspace is a Foundry repository, **not an automatically connected GitHub checkout**. Nothing here pushes to GitHub.
2. In GitHub **Settings → Pages**, choose **GitHub Actions** as the build source.
3. Merge the website changes into the GitHub repository's default branch (`main` or `master`). The workflow builds `website/` with public dependencies and publishes `website/dist`.
4. Inspect the site and confirm that the initial demo banner is visible. Do not describe the preview as official league data until the publisher succeeds.
5. Optional custom domain: set the appropriate base path to `/`, configure the Pages domain/DNS and add the required `CNAME` file.

## Enable daily snapshots

A daily job is not a live backend. It obtains a short-lived API access token using a dedicated backend-service application's credentials, reads current Ontology objects, validates and publishes static data, then exits.

### Foundry setup

Create a **separate Developer Console backend-service application using application permissions**. Grant its service user only the read access needed for the selected league's players, teams, settings, and trade ledger. Restrict its project/operation access to reads. Do not grant action submission or writeback access. If the SDK's application restrictions are relevant, approve only the read resources required by this publisher.

The service user must also be able to read/download the generated `@ymffl-website/sdk` artifact (or provision a separate least-privilege artifact token). Use a stable SDK release after the Foundry proposal is merged; regenerate/synchronize the root package and lockfile if necessary. Keep all credentials in GitHub Actions secrets, never in source, browser variables, JSON snapshots, or this README.

### GitHub configuration

| Kind     | Name                    | Value                                                          |
| -------- | ----------------------- | -------------------------------------------------------------- |
| Variable | `FOUNDRY_URL`           | Foundry enrollment's HTTPS origin                              |
| Variable | `FOUNDRY_ONTOLOGY_RID`  | League ontology RID                                            |
| Variable | `FOUNDRY_LEAGUE_ID`     | Exact league object's primary key; no guess/default            |
| Secret   | `FOUNDRY_CLIENT_ID`     | Backend-service client ID (NOT the public frontend client ID)  |
| Secret   | `FOUNDRY_CLIENT_SECRET` | Backend-service secret                                         |
| Secret   | `FOUNDRY_NPM_TOKEN`     | Artifact download credential for root npm registry/private SDK |
| Variable | `ENABLE_DAILY_SNAPSHOT` | Set to `true` only after a successful manual refresh           |

Run **Actions → Public site and daily snapshot → Run workflow → refresh_snapshot = true** on the default branch. Verify the counts, real league names and budgets, snapshot timestamp, and disappearance of the demo banner. Then enable the daily variable.

The schedule is **09:17 UTC daily**. GitHub may delay or skip scheduled runs; it is not an exact 24-hour freshness guarantee. GitHub may also disable schedules in inactive public repositories. Enable workflow-failure notifications, monitor the displayed timestamp, and use the manual refresh when needed. The website flags real snapshots older than 30 hours.

The workflow commits the new validated JSON back to the default branch using `GITHUB_TOKEN`, so later code deployments cannot revert to the original demo data. Allow this bot write or adapt the persistence step to your branch-protection policy. Writes made using `GITHUB_TOKEN` do not recursively trigger another push workflow. The default workflow grants contents write to this build job for this reason; it never exposes Foundry secrets to pull-request builds.

### Publication safety

- Read current **Ontology objects**, not original workbook datasets: this includes Workshop edits.
- Use paginated OSDK iteration and an explicit league filter on all four object types.
- Publish only allowlisted fields. Audit user IDs, manager identities, notes, secrets, and object metadata are excluded.
- Reject duplicate IDs, broken references, unknown versions, impossible values, price mismatches and inconsistent team totals.
- Different object types are not read in a shared transaction; validation catches pricing/budget inconsistencies during concurrent edits. Retry after commissioner activity if necessary.
- Write the JSON atomically, test it, build it, then deploy. A failed export/validation/build does not replace the hosted last-good site. There is no silent fallback to demo data in the refresh workflow.
- Keep current JSON in Git and deployment versions for rollback. No public runtime request reaches Foundry.

## Simulation semantics

- Published baseline is read-only. What-if mode changes only local state.
- Local browser storage is keyed by the snapshot's content hash. A daily refresh with identical data retains the key; changed data starts a separate scenario. An open tab pins its current snapshot and never silently rebases.
- Reloading to newer data does not migrate the previous scenario. Old local storage is retained but there is no archived-scenario browsing UI yet.
- Official recorded transfers are already included in each team's net budget adjustment: **do not apply the trade ledger a second time**.
- Hypothetical transfers conserve total league dollars, require different existing teams, and cannot exceed the sending team's remaining budget when added. Later keeper changes can create deficits; the UI flags them rather than silently deleting the scenario.
- Existing eligibility, contract locks, manual overrides, elite/standard pricing, rounding, roster size and minimum-bid reserve logic mirror the current league functions. A future rule change needs a rules-version update and parity tests before publication.
- This version models **auction-dollar transfers**, not player-for-player trades or multi-team packages.
- Scenarios are saved only on the device/browser; no accounts, cross-device sync, or scenario-sharing backend is included.

## Verification

```sh
npm test
npm run lint
npm run build
npx tsc --noEmit --module esnext --moduleResolution bundler --target es2022 --skipLibCheck --strict scripts/export-snapshot.ts scripts/create-demo.ts
npm --prefix website test
SITE_BASE_PATH=/YMFFL/ npm --prefix website run build
npx playwright install chromium
npx playwright test
```

Playwright checks desktop, mobile, and 320px-wide screens under the `/YMFFL/` path: no horizontal overflow, no Foundry requests, read-only baseline, eligibility guards, local persistence/reset, hypothetical trade effects and malformed snapshot handling.

If a Chromium binary already exists, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select it. Never commit screenshots, browser reports, credentials or generated build output.
