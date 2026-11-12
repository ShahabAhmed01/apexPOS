# APEXPOS — Maintainer Playbook

Repository: https://github.com/ShahabAhmed01/apexPOS

This playbook provides routine procedures and response templates for maintaining APEXPOS as an open-source project.

These are suggestions, not service-level commitments.

---

## Suggested response routine

- **Daily (5 min):** Check GitHub notifications, triage new issues with `needs-triage` label.
- **Weekly (30 min):** Review open PRs, respond to contributor questions, check Dependabot PRs.
- **Per release:** Update `docs/CHANGELOG.md`, create GitHub release, tag the release.

---

## Issue triage

When a new issue arrives:

1. Add `needs-triage` label.
2. Verify it is not a duplicate (search existing issues).
3. Categorize: `bug`, `enhancement`, `documentation`, `question`.
4. If it is a security vulnerability, do NOT comment publicly — direct the reporter to the private vulnerability reporting mechanism (see `SECURITY.md`).
5. Remove `needs-triage`, add appropriate labels, assign to a milestone if applicable.

### Response template: new bug report

```
Thank you for the report! Could you please:

1. Confirm the APEXPOS version you are using (e.g. v0.2.3)
2. Describe the steps to reproduce, including any seeded user account
3. Share any error messages (redact secrets/personal data first)
4. Let us know your operating system (Windows/Linux/macOS)

We reproduce all bugs against the real Electron UI before fixing.
```

### Response template: feature request

```
Thanks for the suggestion! To help us evaluate:

1. What problem are you trying to solve?
2. Have you considered any alternatives or workarounds?
3. Who would benefit from this feature?

Feature requests are prioritized based on alignment with the offline-first POS scope.
```

### Response template: first-time contributor

```
Welcome to APEXPOS! 👋

A good place to start is the `good first issue` label. Before your first PR:

1. Read `CONTRIBUTING.md` — especially the ground rules about tests for
   money, stock, permissions, and branch-scoping changes.
2. Create a feature branch from `main`.
3. Run `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm test`.
4. Open a pull request using the PR template.

Feel free to ask questions — we're happy to help!
```

---

## Pull request review

When reviewing a PR:

1. **Check the PR template** — all sections completed.
2. **Verify tests** — money, stock, permission, or branch-scoping changes must include tests.
3. **Check adversarial suites** — never deleted, skipped, or weakened.
4. **Check `docs/API.md`** — updated if a new IPC channel was added.
5. **Check `docs/CHANGELOG.md`** — entry under `[Unreleased]`.
6. **Verify no secrets** — no credentials, API keys, or personal data.
7. **Run CI** — wait for GitHub Actions to pass before merging.

---

## Handling bug reports

1. Reproduce against the real Electron UI (not just `electron-vite dev`).
2. Write a failing test first.
3. Fix the bug narrowly — no broad refactoring.
4. Update the test in the same commit if intended behavior changes.
5. Add a CHANGELOG entry.

---

## Handling feature requests

1. Acknowledge the request.
2. Determine if it fits the offline-first POS scope.
3. If yes, label `enhancement` and discuss design.
4. If no, explain why politely and close.

---

## Community moderation

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Enforcement follows the Contributor Covenant guidelines (correction → warning → temporary ban → permanent ban).

---

## Release maintenance

1. Update `docs/CHANGELOG.md` with `Keep a Changelog` format.
2. Tag the release (semver, e.g. `v0.2.4`).
3. Create a GitHub release with notes and built assets.
4. Do NOT auto-publish — draft first, review, then publish.
