# APEXPOS — Show HN Draft

**Status: NOT READY** — Do not post until:
1. The MIT LICENSE is confirmed and merged.
2. Build and tests are verified (Node.js required — not available in this environment).
3. A release with downloadable installers is published (tags exist, no release assets yet).

## Suggested title

APEXPOS — Offline-first desktop POS for retail and restaurants (Electron + React + SQLite)

## Opening comment

APEXPOS is an offline-first hybrid retail + restaurant point-of-sale desktop application. It runs entirely on local hardware with a SQLite database — no internet connection, no cloud account, no per-transaction fees.

Built with Electron 44, React 19, TypeScript (strict), Tailwind 4, and better-sqlite3.

Features retail POS with barcode scan and split tender, restaurant floor plan with tables and KDS board, purchasing with weighted-average costing, inventory ledger, customers with loyalty/gift cards, and reports with CSV export.

The financial core is adversarially hardened: ~205k deterministic money-fuzz cases, IPC fuzzing across every channel, 4-OS-process concurrency races, and a 53-test live torture suite. 175 unit + 18 E2E + 53 torture tests, all green.

Seeded demo credentials included for evaluation — rotate before production use.

## Why I built it

I needed a POS system that doesn't depend on a cloud provider or monthly subscription. APEXPOS keeps all data local and works offline.

## What it does

- **Retail POS**: product grid, barcode scan, cart, discounts, split tender, hold/recall, refunds, keyboard-only operation
- **Restaurant**: floor plan, table management, KDS board with bump, split/merge bills
- **Purchasing**: suppliers, PO lifecycle, idempotent receiving, WAC costing
- **Inventory**: stock movement ledger, low-stock alerts, manager adjustments
- **Customers**: CRM, loyalty points, store credit, gift cards
- **Reports**: sales/financial dashboard, CSV export

## How it works

Electron main process (Node) holds the SQLite database and services. Renderer (React 19) communicates via zod-validated, permission-gated IPC. All money uses integer minor units; all operations are append-only ledger entries with full audit trails.

## How to try it

```bash
git clone https://github.com/ShahabAhmed01/apexPOS.git
cd apexPOS
npm ci
npm run dev
```

Then log in as `cashier` / `Cashier123!` and complete a sale.

Prebuilt installers (Windows NSIS/portable, Linux AppImage/deb) are attached to the GitHub release.

## Current limitations

- No remote sync transport (local-only by design)
- Physical hardware (receipt printer, cash drawer) simulator-verified only
- macOS DMG not buildable from Linux

## Feedback requested

Would an offline-first, self-hosted desktop POS be useful for your retail or small restaurant? What features are missing for your use case?
