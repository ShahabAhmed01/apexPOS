# APEXPOS — Human Action Checklist

Repository: https://github.com/ShahabAhmed01/apexPOS
Branch: `launch/2026-11-07-repository-improvements`

All tasks below require your direct intervention. Priority order: highest-risk first.

## 1. Confirm license choice (CRITICAL — blocks public launch)

**Why:** The repository previously had no LICENSE file but the README said "Proprietary — Final year project (2026)." I added an MIT LICENSE file as a proposal. You must confirm this is the intended license before the repository can be considered open source.

**Expected result:** MIT LICENSE file retained (or replaced with your chosen license).

**Commands:**
- Review `LICENSE` in the repository.
- To change the license, replace `LICENSE` with your chosen license text.

**Blocks public launch:** Yes — without a license, the repository's open-source status is legally unclear.

## 2. Run build and tests (CRITICAL — blocks public launch)

**Why:** Node.js is not available in this execution environment, so I could not run `npm ci`, `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`, or `npm run format:check`. CI will run automatically when the PR is opened, but you should verify locally first.

**Expected result:** All checks pass, matching results reported in `PROGRESS.md`.

**Commands:**
```bash
cd /path/to/apexPOS
npm ci
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

**Blocks public launch:** Yes — CI failures would make the PR unmergeable.

## 3. Set GitHub repository metadata (HIGH)

**Why:** The repository has no description, topics, or social preview, which hurts discoverability.

**Expected result:** Description, topics, and social preview applied on GitHub.

**Click-path (GitHub web UI):**
1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click Settings → General
3. Under "Repository description", enter: "Offline-first hybrid Retail + Restaurant desktop POS — Electron, React 19, TypeScript, SQLite"
4. Scroll to "Topics" and add: electron, react, typescript, pos, point-of-sale, retail, restaurant, sqlite, desktop-app, offline-first, kds, inventory, receipt-printer
5. Scroll to "Social preview" and upload `assets/social-preview.png`
6. Click "Save changes"

**Blocks public launch:** No — but strongly recommended for discoverability.

## 4. Enable GitHub code scanning (HIGH)

**Why:** No automated security scanning is configured for this financial/desktop application.

**Click-path:**
1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click Security → Code security setup
3. Click "Set up" next to "CodeQL analysis" under "Default setup"
4. Choose "Default setup" to enable CodeQL scanning

**Blocks public launch:** No — but strongly recommended.

## 5. Enable Dependabot (MEDIUM)

**Why:** No automated dependency update configuration exists.

**Click-path:**
1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click Security → Dependabot alerts → "Enable Dependabot alerts"
3. Or create `.github/dependabot.yml` and push it

**Blocks public launch:** No.

## 6. Run a full-history secret scan (MEDIUM)

**Why:** No gitleaks/trufflehog available in this environment. A full-history scan is recommended before public launch.

**Commands:**
```bash
# Install gitleaks, then:
gitleaks detect --source /path/to/apexPOS --verbose
```

**Blocks public launch:** Recommended — if a secret is found in history, rotate it before going public.

## 7. Publish first GitHub Release (HIGH)

**Why:** Tags v0.2.0, v0.2.1, v0.2.3 exist but no releases are published. Users cannot download installers.

**Expected result:** A draft release for v0.2.3 with release notes and built assets.

**Click-path:**
1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click Releases → "Draft a new release"
3. Tag: `v0.2.3` (already exists)
4. Title: "APEXPOS v0.2.3 — UI refinement release"
5. Paste release notes from `LAUNCH_KIT/RELEASE_NOTES.md`
6. Build and upload assets (Windows NSIS/portable, Linux AppImage/deb) — do NOT publish yet; keep as draft
7. Click "Save draft" (not "Publish release")

**Blocks public launch:** Yes — without installers, users must build from source.

## 8. Create good first issues (MEDIUM)

**Why:** No entry points exist for new contributors.

**Drafts:** See `LAUNCH_KIT/ISSUE_DRAFTS.md`. Create via GitHub Issues after checking for duplicates.

**Blocks public launch:** No.

## 9. Verify social preview uploaded (LOW)

**Check:** Visit https://github.com/ShahabAhmed01/apexPOS and confirm the social preview image appears on the repository page and in link previews.

**Blocks public launch:** No.
