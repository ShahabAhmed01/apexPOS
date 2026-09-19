# Database Schema

## Overview

SQLite 3 (WAL mode) via `better-sqlite3`. Single file: `apexpos.db`.
Schema versioned via `migrations` table (managed by `src/main/db/migrator.ts`).

## Tables

### Core

| Table              | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `organizations`    | Multi-org support (single org in MVP)           |
| `branches`         | Physical locations (registers belong to branch) |
| `users`            | Staff accounts (Argon2id hash, PIN, role_id)    |
| `roles`            | Role definitions (name, is_system)              |
| `role_permissions` | Many-to-many role → permission                  |
| `audit_log`        | Immutable action trail                          |

### Catalog

| Table                                  | Purpose                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| `categories`                           | Hierarchical (parent_id)                                        |
| `products`                             | SKU, name, price, cost, tax_id, track_stock, barcode, is_active |
| `product_variants`                     | Variant SKU/barcode/price/attributes                            |
| `modifier_groups` / `modifier_options` | Modifier system (linked via `product_modifier_groups`)          |
| `taxes`                                | Code, name, rate_bps, is_default                                |
| `discounts`                            | Percent/fixed, scope, stacking rules                            |

### Inventory

| Table                  | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `stock_movements`      | Append-only ledger (qty_delta in milli-units, reason, ref_type/ref_id) |
| `suppliers`            | Supplier master                                                        |
| `purchase_orders`      | PO header (status: draft/sent/partial/received/cancelled)              |
| `purchase_order_items` | PO lines (ordered/received qty)                                        |

### Customers & Loyalty

| Table                       | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `customers`                 | Name, contact, loyalty_points, store_credit, tags, is_active |
| `loyalty_transactions`      | Audit trail (delta, balance, reason, ref)                    |
| `store_credit_transactions` | Audit trail                                                  |
| `gift_cards`                | Code, initial/remaining balance, status, expiry              |
| `gift_card_transactions`    | Audit trail                                                  |

### Sales

| Table                  | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `orders`               | Header (type: retail/dine_in/takeaway, status, totals, shift_id, table_id, customer_id, client_op_id) |
| `order_lines`          | Lines (qty in milli-units, unit_price, tax_bps, tax_amount, line_total, kitchen status)               |
| `order_line_modifiers` | Applied modifiers                                                                                     |
| `payments`             | Tender lines (method, amount, status, client_op_id for idempotency)                                   |
| `refunds`              | Refund header (prorated tax/discount, manager override PIN)                                           |
| `refund_lines`         | Refund line items                                                                                     |

### Restaurant

| Table               | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `zones`             | Floor zones (name, color, sort)                                |
| `restaurant_tables` | Table (zone_id, name, shape, x/y/w/rotation, capacity, status) |

Note: open table state is derived from the active `orders.table_id` — there is no
separate `table_sessions` table in v1.

### Registers & Cash

| Table            | Purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `registers`      | Register definition (name, branch_id)                                       |
| `shifts`         | Shift (register_id, user_id, opening_float, expected/actual cash, variance) |
| `cash_movements` | Pay in/out (reason, amount, shift_id)                                       |

### Settings & System

| Table           | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `settings`      | Key/value (JSON), validated by registry            |
| `notifications` | In-app notifications (kind, severity, read flag)   |
| `sync_outbox`   | Future sync queue (op_id, entity, action, payload) |

## Indexes

Key indexes (see `src/main/db/schema.ts`):

- `idx_orders_branch_created` (branch_id, created_at)
- `idx_orders_status` (status)
- `idx_orders_shift` (shift_id)
- `idx_orders_customer` (customer_id)
- `idx_orders_table` (table_id)
- `idx_orders_number` (branch_id, number)
- `idx_order_lines_order` (order_id)
- `idx_order_lines_product` (product_id)
- `idx_stock_movements_product_branch` (product_id, branch_id)
- `idx_payments_order` (order_id)
- `idx_shifts_one_open` (partial unique: one open shift per register)

## Migrations

`src/main/db/migrator.ts`:

- Creates `migrations` table if missing
- Applies pending migrations in order
- Current: `0001_initial` (full schema) + `0002_refund_tracking` (payments.refunded_amount, refunds.method)
- **Rule**: Schema must NOT contain `CREATE TABLE migrations` — migrator creates it.

## Seeding

`src/main/db/seed.ts` → `seedIfEmpty(db)`:

- Runs once per database (checks `organizations` count)
- Creates: 1 org, 1 branch, 1 register, 9 categories, 82 products (12 variants), 10 users/roles, 10 tables, 12 customers, 2 gift cards, 3 suppliers, 25 menu items, 18% tax
- **60 days of synthetic history**: ~387 orders with payments (for dashboard/reports demo)

## Money Storage

All monetary columns = `INTEGER` (minor units). E.g., PKR 120.00 = 12000.
Quantities = `INTEGER` milli-units (1 kg = 1000).

## WAL Mode

Enabled via pragmas in `src/main/db/database.ts`:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

## Backup

`SystemService.createBackup()`:

1. `PRAGMA wal_checkpoint(TRUNCATE)`
2. `fs.copyFileSync(source, target)`
3. Returns `{ file, createdAt, sizeBytes }`

Restore replaces DB file and triggers `app.relaunch(); app.exit(0)`.
