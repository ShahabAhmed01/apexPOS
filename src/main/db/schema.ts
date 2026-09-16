/**
 * Canonical DDL for APEXPOS. Applied by the migrator as migration 0001.
 *
 * Conventions:
 *  - TEXT ids (UUIDv4) unless a human-facing sequential number is needed.
 *  - All money columns: INTEGER minor units. All qty columns: INTEGER milli-units.
 *  - All timestamps: TEXT ISO-8601 UTC.
 *  - Boolean columns: INTEGER 0/1 with CHECK constraints.
 */
export const SCHEMA_0001 = `
-- ==========================================================================
-- Organization structure
-- ==========================================================================
CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  legal_name    TEXT,
  tax_id        TEXT,
  currency      TEXT NOT NULL DEFAULT 'PKR',
  timezone      TEXT NOT NULL DEFAULT 'Asia/Karachi',
  created_at    TEXT NOT NULL
);

CREATE TABLE branches (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  UNIQUE (organization_id, code)
);

CREATE TABLE registers (
  id         TEXT PRIMARY KEY,
  branch_id  TEXT NOT NULL REFERENCES branches(id),
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  UNIQUE (branch_id, code)
);

CREATE TABLE terminals (
  id          TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  register_id TEXT REFERENCES registers(id),
  name        TEXT NOT NULL,
  device_key  TEXT NOT NULL UNIQUE
);

-- ==========================================================================
-- Auth
-- ==========================================================================
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1))
);

CREATE TABLE role_permissions (
  role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,
  role_id       TEXT NOT NULL REFERENCES roles(id),
  branch_id     TEXT REFERENCES branches(id),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  branch_id  TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- ==========================================================================
-- Catalog
-- ==========================================================================
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE brands (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE units (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  decimals      INTEGER NOT NULL DEFAULT 0,
  base_unit_id  TEXT REFERENCES units(id),
  ratio_to_base REAL
);

CREATE TABLE taxes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  rate_bps   INTEGER NOT NULL CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  inclusive  INTEGER NOT NULL DEFAULT 0 CHECK (inclusive IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE products (
  id                  TEXT PRIMARY KEY,
  sku                 TEXT NOT NULL UNIQUE,
  barcode             TEXT,
  name                TEXT NOT NULL,
  description         TEXT,
  category_id         TEXT REFERENCES categories(id),
  brand_id            TEXT REFERENCES brands(id),
  type                TEXT NOT NULL DEFAULT 'standard' CHECK (type IN ('standard','variant_parent','service')),
  unit_id             TEXT NOT NULL REFERENCES units(id),
  price               INTEGER NOT NULL CHECK (price >= 0),
  cost                INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  tax_id              TEXT REFERENCES taxes(id),
  track_stock         INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0,1)),
  low_stock_threshold INTEGER,
  is_weighted         INTEGER NOT NULL DEFAULT 0 CHECK (is_weighted IN (0,1)),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  image_path          TEXT,
  tags                TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_name ON products(name);

CREATE TABLE product_variants (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  barcode     TEXT,
  name        TEXT NOT NULL,
  attributes  TEXT NOT NULL DEFAULT '{}',
  price       INTEGER NOT NULL CHECK (price >= 0),
  cost        INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  is_active   INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX idx_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE modifier_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  required   INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1))
);

CREATE TABLE modifier_options (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_modifier_options_group ON modifier_options(group_id);

CREATE TABLE product_modifier_groups (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE discounts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('percent','amount')),
  value            INTEGER NOT NULL CHECK (value >= 0),
  max_amount_minor INTEGER,
  requires_manager INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1
);

-- ==========================================================================
-- Orders / Payments
-- ==========================================================================
CREATE TABLE order_counters (
  branch_id TEXT NOT NULL,
  date_key  TEXT NOT NULL,
  last_no   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, date_key)
);

CREATE TABLE orders (
  id                  TEXT PRIMARY KEY,
  branch_id           TEXT NOT NULL,
  number              INTEGER NOT NULL,
  number_label        TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('retail','dine_in','takeaway')),
  status              TEXT NOT NULL CHECK (status IN ('draft','held','open','sent_to_kitchen','partially_served','served','billed','completed','void')),
  register_id         TEXT,
  terminal_id         TEXT NOT NULL,
  shift_id            TEXT,
  user_id             TEXT NOT NULL,
  customer_id         TEXT,
  table_id            TEXT,
  subtotal            INTEGER NOT NULL DEFAULT 0,
  discount_total      INTEGER NOT NULL DEFAULT 0,
  tax_total           INTEGER NOT NULL DEFAULT 0,
  service_charge      INTEGER NOT NULL DEFAULT 0,
  tip                 INTEGER NOT NULL DEFAULT 0,
  rounding_adjustment INTEGER NOT NULL DEFAULT 0,
  total               INTEGER NOT NULL DEFAULT 0,
  hold_name           TEXT,
  client_op_id        TEXT UNIQUE,
  created_at          TEXT NOT NULL,
  completed_at        TEXT,
  voided_at           TEXT,
  void_reason         TEXT,
  void_approved_by    TEXT,
  version             INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_orders_branch_created ON orders(branch_id, created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_number ON orders(branch_id, number);

CREATE TABLE order_lines (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL,
  variant_id       TEXT,
  sku              TEXT NOT NULL,
  name             TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),
  line_discount    INTEGER NOT NULL DEFAULT 0,
  tax_bps          INTEGER NOT NULL DEFAULT 0,
  tax_amount       INTEGER NOT NULL DEFAULT 0,
  line_total       INTEGER NOT NULL,
  kitchen_station  TEXT,
  course           TEXT,
  seat             INTEGER,
  notes            TEXT,
  allergy_flag     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','fired','preparing','ready','served','void')),
  refunded_qty     INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);
CREATE INDEX idx_order_lines_product ON order_lines(product_id);
CREATE INDEX idx_order_lines_kitchen ON order_lines(status) WHERE kitchen_station IS NOT NULL;

CREATE TABLE order_line_modifiers (
  id                TEXT PRIMARY KEY,
  order_line_id     TEXT NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  modifier_option_id TEXT NOT NULL,
  name              TEXT NOT NULL,
  price_delta       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_olm_line ON order_line_modifiers(order_line_id);

CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  method           TEXT NOT NULL CHECK (method IN ('cash','card','mobile_wallet','gift_card','store_credit','bank_transfer','voucher')),
  amount           INTEGER NOT NULL,
  tendered         INTEGER,
  change_amount    INTEGER,
  reference        TEXT,
  status           TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','declined','cancelled','refunded')),
  card_brand       TEXT,
  card_last4       TEXT,
  approval_code    TEXT,
  client_op_id     TEXT UNIQUE,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_created ON payments(created_at);

CREATE TABLE refunds (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id),
  number         INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  total          INTEGER NOT NULL,
  approved_by    TEXT,
  client_op_id   TEXT UNIQUE,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_refunds_order ON refunds(order_id);

CREATE TABLE refund_lines (
  id            TEXT PRIMARY KEY,
  refund_id     TEXT NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  order_line_id TEXT NOT NULL REFERENCES order_lines(id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  amount        INTEGER NOT NULL
);

-- ==========================================================================
-- Register / cash
-- ==========================================================================
CREATE TABLE shifts (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL,
  register_id    TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_float  INTEGER NOT NULL DEFAULT 0,
  expected_cash  INTEGER,
  counted_cash   INTEGER,
  variance       INTEGER,
  opened_at      TEXT NOT NULL,
  closed_at      TEXT,
  note           TEXT
);
CREATE UNIQUE INDEX idx_shifts_one_open ON shifts(register_id) WHERE status = 'open';
CREATE INDEX idx_shifts_branch ON shifts(branch_id, opened_at);

CREATE TABLE cash_movements (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shifts(id),
  kind       TEXT NOT NULL CHECK (kind IN ('pay_in','pay_out','no_sale')),
  amount     INTEGER NOT NULL DEFAULT 0,
  reason     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cash_movements_shift ON cash_movements(shift_id);

-- ==========================================================================
-- Inventory
-- ==========================================================================
CREATE TABLE stock_movements (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  branch_id  TEXT NOT NULL,
  qty_delta  INTEGER NOT NULL,
  reason     TEXT NOT NULL CHECK (reason IN ('sale','refund','receive','adjustment','waste','transfer_out','transfer_in','stocktake','initial')),
  ref_type   TEXT,
  ref_id     TEXT,
  unit_cost  INTEGER,
  note       TEXT,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sm_product_branch ON stock_movements(product_id, branch_id);
CREATE INDEX idx_sm_created ON stock_movements(created_at);
CREATE INDEX idx_sm_ref ON stock_movements(ref_type, ref_id);

CREATE TABLE suppliers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE purchase_orders (
  id          TEXT PRIMARY KEY,
  number      INTEGER NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  branch_id   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','received','cancelled')),
  expected_at TEXT,
  notes       TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  sent_at     TEXT,
  received_at TEXT
);
CREATE INDEX idx_po_status ON purchase_orders(status);

CREATE TABLE purchase_order_items (
  id           TEXT PRIMARY KEY,
  po_id        TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL,
  variant_id   TEXT,
  qty_ordered  INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received INTEGER NOT NULL DEFAULT 0,
  unit_cost    INTEGER NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX idx_poi_po ON purchase_order_items(po_id);

-- ==========================================================================
-- Restaurant
-- ==========================================================================
CREATE TABLE zones (
  id         TEXT PRIMARY KEY,
  branch_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE restaurant_tables (
  id         TEXT PRIMARY KEY,
  zone_id    TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 4,
  shape      TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('square','round','rect')),
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  w          REAL NOT NULL DEFAULT 80,
  h          REAL NOT NULL DEFAULT 80,
  rotation   REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_tables_zone ON restaurant_tables(zone_id);

-- ==========================================================================
-- Customers / loyalty
-- ==========================================================================
CREATE TABLE customers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  notes          TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  store_credit   INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE loyalty_transactions (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  delta       INTEGER NOT NULL,
  balance     INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref_type    TEXT,
  ref_id      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE store_credit_transactions (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  delta       INTEGER NOT NULL,
  balance     INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref_type    TEXT,
  ref_id      TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE gift_cards (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  initial_balance INTEGER NOT NULL,
  balance         INTEGER NOT NULL CHECK (balance >= 0),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','deactivated')),
  expires_at      TEXT,
  created_at      TEXT NOT NULL,
  CHECK (balance <= initial_balance)
);

CREATE TABLE gift_card_transactions (
  id          TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES gift_cards(id),
  delta       INTEGER NOT NULL,
  balance     INTEGER NOT NULL,
  ref_type    TEXT,
  ref_id      TEXT,
  created_at  TEXT NOT NULL
);

-- ==========================================================================
-- System
-- ==========================================================================
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  branch_id   TEXT,
  terminal_id TEXT,
  context     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title      TEXT NOT NULL,
  body       TEXT,
  entity     TEXT,
  entity_id  TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_read ON notifications(is_read, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sync_outbox (
  id          TEXT PRIMARY KEY,
  op_id       TEXT NOT NULL UNIQUE,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  synced_at   TEXT
);

`
