#!/usr/bin/env bash
# Interactive, one-time export on your own computer. Does not commit or upload files.
# Disable tracing before reading credentials; never put a token in command arguments.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" || ! -t 0 ]]; then
  printf '%s\n' 'This helper is for an interactive local terminal only. Daily jobs still require service credentials.' >&2
  exit 1
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  printf '%s\n' 'Install Node.js 22 LTS (includes npm), then run this helper again.' >&2
  exit 1
fi
if ! node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'; then
  printf '%s\n' 'Node.js 22 or newer is required. Upgrade Node before continuing.' >&2
  exit 1
fi
printf '%s\n' 'This reads all current YMFFL keeper cycles by default, validates all, then publishes website/public/data/.'
printf '%s\n' 'Output includes immutable cycle JSON files, a latest snapshot.json alias, and manifest.json written last.'
printf '%s\n' 'It does not change Foundry, commit code, or upload anything to GitHub.'
printf '%s\n' 'Use a short-lived Foundry API token from your account settings, NOT a Git clone token, GitHub token or OAuth client ID.'
read -r -s -p 'Paste your short-lived Foundry API token (input hidden), then press Return: ' FOUNDRY_READ_TOKEN
printf '\n'
if [[ -z "$FOUNDRY_READ_TOKEN" ]]; then
  printf '%s\n' 'No token entered. Nothing changed.' >&2
  exit 1
fi
export FOUNDRY_READ_TOKEN
# The same user must already have read access to this repository's private SDK artifact.
export FOUNDRY_TOKEN="$FOUNDRY_READ_TOKEN"
export FOUNDRY_URL="${FOUNDRY_URL:-https://drover.usw-3.palantirfoundry.com}"
export FOUNDRY_ONTOLOGY_RID="${FOUNDRY_ONTOLOGY_RID:-ri.ontology.main.ontology.956ef511-06bb-4422-8a80-091a39acd4ad}"
export FOUNDRY_LEAGUE_ID="${FOUNDRY_LEAGUE_ID:-all}"
trap 'unset FOUNDRY_READ_TOKEN FOUNDRY_TOKEN' EXIT
printf '%s\n' 'Installing publisher dependencies without lifecycle scripts...'
npm ci --ignore-scripts
printf '%s\n' 'Reading and validating current league data...'
npm run snapshot:export -- --manual
unset FOUNDRY_READ_TOKEN FOUNDRY_TOKEN
printf '\n%s\n' 'Local publication saved. Check the league IDs and team/player counts above.'
printf '%s\n' 'Nothing has been uploaded. Review and copy the data directory as a unit; publish manifest.json last.'
printf '%s\n' 'You can revoke the short-lived API token now. Daily sync remains disabled.'
