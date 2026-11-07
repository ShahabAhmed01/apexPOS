# Security

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

If you discover a security issue, contact the maintainer through GitHub's private vulnerability reporting mechanism (the "Report a vulnerability" button on the repository's Security tab), or open an issue marked as a security concern without publishing exploit details.

Include:
- A clear description of the vulnerability
- Steps to reproduce
- The affected component or version
- Any suggested fix or mitigation

## Threat model and mitigations

The detailed threat model — covering the local SQLite database, credentials (Argon2id), cash data, IPC hardening, receipt printing, customer display, and settings security — is maintained in [`docs/SECURITY.md`](docs/SECURITY.md).

## Known limitations

- No disk encryption at rest (relies on OS disk encryption: BitLocker, FileVault, LUKS).
- No remote wipe or device binding.
- No hardware security module (TPM/HSM) integration.
- Sync outbox is local-only; there is no remote transport.

## Seeded demo credentials

The fresh-demo database seeds ten default user accounts with documented passwords (see README). These are intentional demo credentials. **Production deployments must rotate all seeded credentials before use.**
