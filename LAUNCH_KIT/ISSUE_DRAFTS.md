# APEXPOS — Suggested Issue Drafts

Do NOT create these automatically. Review each for duplication, then create manually via GitHub if appropriate.

---

## Issue 1: Fix broken ARCHITECTURE.md and DATABASE.md links in README

**Title:** docs: fix broken ARCHITECTURE.md and DATABASE.md links in README

**Problem:** Root README.md references `ARCHITECTURE.md` and `DATABASE.md` as root-level files, but they live in `docs/`. The links are broken.

**Why it matters:** New visitors following documentation links hit 404s.

**Relevant files:** `README.md`, `docs/README.md`

**Suggested implementation:** Change links to `docs/ARCHITECTURE.md` and `docs/DATABASE.md`.

**Acceptance criteria:**
- Links resolve correctly on GitHub
- No broken doc links in root README

**Testing:** Click links on GitHub repo page

---

## Issue 2: Add Dependabot configuration

**Title:** ci: add Dependabot for npm and GitHub Actions

**Problem:** No automated dependency update configuration exists.

**Why it matters:** Dependencies should be kept up to date for security and bug fixes.

**Suggested implementation:** Create `.github/dependabot.yml` with monthly updates for npm and github-actions ecosystems.

**Acceptance criteria:**
- `.github/dependabot.yml` committed
- Dependabot PRs appear periodically

**Testing:** Check Dependabot tab in GitHub UI

---

## Issue 3: Enable GitHub code scanning (CodeQL)

**Title:** security: enable CodeQL code scanning

**Problem:** No automated security scanning is configured for the repository.

**Why it matters:** A financial/desktop application should have automated vulnerability scanning.

**Suggested implementation:** Enable CodeQL default setup via GitHub Security settings.

**Acceptance criteria:**
- Code scanning appears in Security tab
- Scans run on push and PR

**Testing:** Check Security tab shows active scanning

---

## Issue 4: Publish first GitHub Release

**Title:** rel: publish v0.2.3 release with built assets

**Problem:** Tags v0.2.0, v0.2.1, v0.2.3 exist but no releases are published.

**Why it matters:** Users cannot download installers without building from source.

**Suggested implementation:** Create a draft release for v0.2.3 using `LAUNCH_KIT/RELEASE_NOTES.md`, build and attach Windows NSIS/portable and Linux AppImage/deb assets.

**Acceptance criteria:**
- Draft release created with release notes
- Build artifacts attached
- Release not yet published (draft only)

**Testing:** Download and install the attached assets

---

## Issue 5: Add root-level docs navigation

**Title:** docs: add root-level docs index or improve README doc links

**Problem:** Documentation is scattered across `docs/` without a root-level index.

**Why it matters:** New visitors need a clear entry point to the documentation.

**Suggested implementation:** Add a "Documentation" section to README with links to all docs/ files, or create a root `docs/index.md`.

**Acceptance criteria:**
- All docs/ files linked from README
- No orphaned documentation

**Testing:** Navigate from README to each docs page
