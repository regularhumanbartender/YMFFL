#!/usr/bin/env bash
set -euo pipefail
patch_dir="${JEMMA_PATCH_DIR:?JEMMA_PATCH_DIR is not set -- this script must run inside a Jemma patch job.}"
patch_name="sync-sdk-dependencies"
git checkout -- package.json package-lock.json
npx @osdk/cli@0.115.0 branch sync
if git diff --quiet -- package.json package-lock.json; then
  echo "No changes to package.json/package-lock.json, nothing to patch."
  exit 0
fi
mkdir -p "${patch_dir}"
git diff -- package.json package-lock.json > "${patch_dir}/${patch_name}.patch"
cat > "${patch_dir}/${patch_name}.changelog" <<'EOF'
title: "Sync SDK dependencies"
EOF
git checkout -- package.json package-lock.json
# Exit code 10 signaling that something changed
exit 10
