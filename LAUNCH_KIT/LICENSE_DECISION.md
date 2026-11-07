# APEXPOS — License Decision

Repository: https://github.com/ShahabAhmed01/apexPOS
Current state: No LICENSE file existed. README previously stated "Proprietary — Final year project (2026)."
Proposed action: MIT LICENSE file added on branch `launch/2026-11-07-repository-improvements`.

## Situation

The repository is public on GitHub but had no LICENSE file. The README described the project as "Proprietary — Final year project (2026)." This creates a legal ambiguity: a public repository without a license is subject to default copyright (all rights reserved), which contradicts the goal of an open-source launch. Contributors and users have no explicit rights to copy, modify, or distribute the software without a license.

## Available choices

| License | Type | Implications |
|---------|------|--------------|
| **MIT** (proposed) | Permissive | Minimal restrictions. Allows commercial use, modification, distribution, private use. Requires preserving copyright and license notice. Good for developer tools and desktop apps seeking adoption. |
| Apache-2.0 | Permissive | Like MIT, plus explicit patent grant. Slightly more complex text. |
| GPL-3.0 | Copyleft | Requires derivative works to be GPL. May limit adoption in commercial/proprietary settings. |
| Proprietary (no license) | All rights reserved | Default for public GitHub repos without LICENSE. Not open source. |

## Recommendation: MIT

**Rationale:**
- APEXPOS is a desktop POS application, not a library or framework. A permissive license maximizes adoption.
- The project appears to be a final-year project that is now being launched publicly. MIT is simple, well-understood, and commonly used for this type of project.
- MIT does not impose patent or copyleft obligations that could complicate future commercial use by the author or adopters.
- The existing dependency stack includes MIT, Apache, BSD, and ISC-licensed packages — MIT is compatible with all of them.

## What was done

- Created `LICENSE` with the MIT License text (Copyright 2026 APEXPOS Project)
- Updated `README.md` license section to reference the MIT License
- Created root-level `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` all referencing MIT

## What remains

**Your decision:** Confirm the MIT license or choose a different one.

- To keep MIT: No action needed — the LICENSE file is already in the branch.
- To choose a different license: Replace `LICENSE` with your chosen license text, update `README.md` and `LAUNCH_KIT/LICENSE_DECISION.md` accordingly.

**Blocks public launch:** Yes — without a confirmed license, the repository's open-source status is legally unclear.
