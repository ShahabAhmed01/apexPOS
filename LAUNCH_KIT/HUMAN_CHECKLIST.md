# APEXPOS — Human Action Checklist

Repository: https://github.com/ShahabAhmed01/apexPOS
Branch: `launch/2026-11-07-repository-improvements` (PUSHED)
Draft PR: https://github.com/ShahabAhmed01/apexPOS/pull/1

## COMPLETED AUTONOMOUSLY (no action needed from you)

| Task                                  | Status                                      |
| ------------------------------------- | ------------------------------------------- |
| Repository description                | SET via GitHub API                          |
| Topics (13 relevant topics)           | ADDED via GitHub API                        |
| Labels (needs-triage, security, etc.) | CREATED via `gh` CLI                        |
| Good first issues (5 issues)          | CREATED via `gh` CLI (#2-#6)                |
| Draft release v0.2.3                  | CREATED via GitHub API                      |
| Code scanning workflow                | ADDED `.github/workflows/code-scanning.yml` |
| All community files                   | ADDED to branch                             |
| MIT LICENSE                           | ADDED to branch                             |
| README fixes + badges                 | ADDED to branch                             |
| Social preview assets                 | PNG + SVG in `assets/`                      |

---

## REMAINING — your direct intervention needed

### 1. Confirm license choice (CRITICAL — blocks public launch)

**Why:** I added an MIT LICENSE file as a proposal. You must confirm this is the intended license.

**What to do:** Review `LICENSE` in the repository. If you want a different license, replace `LICENSE` with your chosen text and update `LAUNCH_KIT/LICENSE_DECISION.md`. If MIT is fine, no action needed.

**Blocks public launch:** Yes.

### 2. Run build and tests (CRITICAL — blocks public launch)

**Why:** Node.js is not available in this execution environment, so I could not run the verification commands locally. CI will run when the PR is opened, but you should verify locally first.

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

### 3. Upload social preview image (YOU WILL DO THIS)

**Why:** The repository needs a social preview for link sharing.

**File to upload:** `assets/social-preview.png` (1280×640, ~76 KB)

**Step-by-step click-path:**

1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click **Settings** (top right of repo page, or the gear icon)
3. Click **General** in the left sidebar (it should be the default)
4. Scroll down to the **Social preview** section
5. Click **Upload image** or **Change image**
6. Select `assets/social-preview.png` from your local clone of the repository
7. Click **Save changes**

**Verification:** After saving, the social preview should appear on the right side of the General settings page. When you share the repo link on social media, this image will show as the preview.

**Blocks public launch:** No — but recommended for discoverability.

### 4. Enable Dependabot security updates (RECOMMENDED)

**Why:** Dependabot alerts are enabled but security updates (auto-PRs for vulnerable dependencies) are not.

**Click-path:**

1. Go to https://github.com/ShahabAhmed01/apexPOS
2. Click **Security** in the top navigation
3. Click **Dependabot alerts** in the left sidebar
4. Click **Enable Dependabot alerts** if not already enabled
5. Look for **Dependabot security updates** and enable it

**Blocks public launch:** No.

### 5. Review and merge the draft PR

**Why:** All changes are in a draft PR waiting for your review.

**Click-path:**

1. Go to https://github.com/ShahabAhmed01/apexPOS/pull/1
2. Review the files changed
3. Add a comment if you have questions
4. When ready, change from "Draft" to "Ready for review" and request review (or merge directly as owner)

**Blocks public launch:** Yes — changes must be merged before release.

### 6. Publish the first release (HIGH)

**Why:** Tags exist but no release is published with installers.

**Click-path:**

1. Go to https://github.com/ShahabAhmed01/apexPOS/releases
2. Click on the draft v0.2.3 release
3. Build and attach Windows NSIS/portable and Linux AppImage/deb assets (requires Node.js)
4. Click **Publish release**

**Blocks public launch:** Yes — users need installers.

---

## Next steps in order

1. Confirm MIT license (or replace LICENSE)
2. Run `npm ci`, `npm test`, `npm run build` locally
3. Upload `assets/social-preview.png` via GitHub Settings → General → Social preview
4. Review and merge draft PR #1
5. Publish first release v0.2.3 with build artifacts
