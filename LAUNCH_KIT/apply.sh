#!/usr/bin/env bash
# APEXPOS — apply.sh
# Exact remaining commands after local execution is complete.
# Run these in order. No secrets or tokens are embedded.

set -euo pipefail

REPO_DIR="/path/to/apexPOS"   # <-- set this to your clone path

echo "=== APEXPOS Launch Kit — apply.sh ==="
echo "Repository: $REPO_DIR"
echo ""

# 1. Switch to the improvement branch
echo "[1/7] Switching to branch launch/2026-11-07-repository-improvements"
cd "$REPO_DIR"
git checkout launch/2026-11-07-repository-improvements

# 2. Verify working tree is clean
echo "[2/7] Checking working tree status"
git status --short

# 3. Install dependencies and run verification
echo "[3/7] Installing dependencies and running checks"
npm ci
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build

# 4. Push the branch to GitHub
echo "[4/7] Pushing branch to GitHub"
git push origin launch/2026-11-07-repository-improvements

# 5. Open a draft pull request
echo "[5/7] Opening a draft pull request"
gh pr create \
  --base main \
  --head launch/2026-11-07-repository-improvements \
  --title "chore: repository launch improvements" \
  --body "See LAUNCH_KIT/REPORT.md for the full audit. Draft PR — not ready for merge." \
  --draft

echo ""
echo "=== Next manual steps (see LAUNCH_KIT/HUMAN_CHECKLIST.md) ==="
echo "1. Confirm the MIT license choice (LICENSE file)"
echo "2. Set GitHub repository description, topics, and social preview"
echo "3. Enable GitHub code scanning (CodeQL)"
echo "4. Enable Dependabot"
echo "5. Run a full-history secret scan (gitleaks/trufflehog)"
echo "6. Publish the first GitHub Release (v0.2.3)"
echo "7. Create good first issues from LAUNCH_KIT/ISSUE_DRAFTS.md"
echo ""
echo "Done."
