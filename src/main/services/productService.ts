import type { DB } from '../db/database'
import type { Product, ProductVariant, Paginated } from '@shared/types/models'
import { AppError, ErrorCode } from '@shared/lib/errors'
import type { StockAdjustInput } from '@shared/ipc/api'
import type { AuthService } from './authService'

export class ProductService {
  constructor(
    private db: DB,
    private branchId: string,
    private auth?: AuthService
  ) {}

  private static readonly SELECT = `SELECT p.*, t.rate_bps AS tax_rate FROM products p
    LEFT JOIN taxes t ON t.id = p.tax_id`

  get(idOrSku: string): Product {
    const row = this.db
      .prepare(`${ProductService.SELECT} WHERE p.id = ? OR p.sku = ?`)
      .get(idOrSku, idOrSku) as ProductRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Product not found: ${idOrSku}`)
    return this.toProduct(row)
  }

  list(opts: {
    search?: string
    categoryId?: string
    limit?: number
    offset?: number
  }): Paginated<Product> {
    const limit = opts.limit ?? 100
    const offset = opts.offset ?? 0
    const params: unknown[] = []
    let where = 'WHERE p.is_active = 1'
    if (opts.categoryId) {
      where += ' AND p.category_id = ?'
      params.push(opts.categoryId)
    }
    if (opts.search) {
      where += ` AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\')`
      const like = `%${opts.search.replace(/([%_\\])/g, '\\$1')}%`
      params.push(like, like, like)
    }
    const total = (
      this.db.prepare(`SELECT COUNT(*) c FROM products p ${where}`).get(...params) as { c: number }
    ).c
    const rows = this.db
      .prepare(`${ProductService.SELECT} ${where} ORDER BY p.name LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as ProductRow[]
    return { items: rows.map((r) => this.toProduct(r)), total, limit, offset }
  }

  search(term: string, limit = 20): Product[] {
    const like = `%${term.replace(/([%_\\])/g, '\\$1')}%`
    const rows = this.db
      .prepare(
        `${ProductService.SELECT} WHERE p.is_active = 1 AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\') ORDER BY p.name LIMIT ?`
      )
      .all(like, like, like, limit) as ProductRow[]
    return rows.map((r) => this.toProduct(r))
  }

  byBarcode(barcode: string): Product | null {
    const row = this.db
      .prepare(`${ProductService.SELECT} WHERE p.barcode = ? AND p.is_active = 1`)
      .get(barcode) as ProductRow | undefined
    if (row) return this.toProduct(row)
    // Look up variants
    const vr = this.db
      .prepare('SELECT product_id FROM product_variants WHERE barcode = ? AND is_active = 1')
      .get(barcode) as { product_id: string } | undefined
    if (vr) return this.get(vr.product_id)
    return null
  }

  onHand(productId: string, variantId?: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(qty_delta), 0) AS q FROM stock_movements
         WHERE product_id = ? AND branch_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))`
      )
      .get(productId, this.branchId, variantId ?? null, variantId ?? null) as { q: number }
    return row.q
  }

  lowStock(): Product[] {
    const rows = this.db
      .prepare(
        `${ProductService.SELECT} WHERE p.is_active = 1 AND p.track_stock = 1 AND p.low_stock_threshold IS NOT NULL`
      )
      .all() as ProductRow[]
    return rows
      .filter((r) => this.onHand(r.id) < (r.low_stock_threshold ?? 0))
      .map((r) => this.toProduct(r))
  }

  /**
   * Manual stock adjustment / waste write-off. Guarded by the
   * `inventory.adjust` permission AND a fresh manager PIN override
   * (the key is listed in OVERRIDE_GUARDED_ACTIONS). Records a signed
   * stock movement and audits the action; negative results are rejected
   * unless the branch opts into negative stock.
   */
  adjustStock(input: StockAdjustInput, userId: string): void {
    if (!this.auth) throw new AppError(ErrorCode.Internal, 'adjustStock requires auth.')
    if (!Number.isInteger(input.qtyDeltaMilli) || input.qtyDeltaMilli === 0) {
      throw new AppError(ErrorCode.Validation, 'Adjustment quantity must be a non-zero integer.')
    }
    const product = this.db
      .prepare('SELECT id, name, cost, track_stock FROM products WHERE id = ? AND is_active = 1')
      .get(input.productId) as
      { id: string; name: string; cost: number; track_stock: number } | undefined
    if (!product) throw new AppError(ErrorCode.NotFound, `Product not found: ${input.productId}`)
    if (product.track_stock !== 1) {
      throw new AppError(ErrorCode.Validation, `Stock is not tracked for "${product.name}".`)
    }
    if (input.variantId) {
      const variant = this.db
        .prepare('SELECT id FROM product_variants WHERE id = ? AND product_id = ?')
        .get(input.variantId, input.productId)
      if (!variant) throw new AppError(ErrorCode.NotFound, `Variant not found: ${input.variantId}`)
    }
    const approverId = this.auth.verifyOverride(input.managerPin ?? '', 'inventory.adjust')

    const allowNegative =
      (
        this.db
          .prepare(
            "SELECT json_extract(value, '$.allowNegativeStock') AS v FROM settings WHERE key = 'app.pos'"
          )
          .get() as { v: number | null } | undefined
      )?.v === 1
    const onHand = this.onHand(input.productId, input.variantId)
    if (!allowNegative && onHand + input.qtyDeltaMilli < 0) {
      throw new AppError(
        ErrorCode.Validation,
        `Adjustment would take stock negative (${onHand / 1000} on hand, delta ${input.qtyDeltaMilli / 1000}).`
      )
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO stock_movements (id, product_id, variant_id, branch_id, qty_delta, reason, unit_cost, note, user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          crypto.randomUUID(),
          input.productId,
          input.variantId ?? null,
          this.branchId,
          input.qtyDeltaMilli,
          input.reason,
          input.qtyDeltaMilli < 0 ? product.cost : null,
          input.note,
          userId,
          new Date().toISOString()
        )
      this.auth!.audit(
        userId,
        undefined,
        'inventory.adjust',
        'product',
        input.productId,
        this.branchId,
        {
          variantId: input.variantId ?? null,
          delta: input.qtyDeltaMilli,
          reason: input.reason,
          note: input.note,
          approvedBy: approverId
        }
      )
    })
    tx.immediate()
  }

  private toProduct(row: ProductRow): Product {
    const variants = this.db
      .prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY name')
      .all(row.id) as VariantRow[]
    return {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode ?? undefined,
      name: row.name,
      description: row.description ?? undefined,
      categoryId: row.category_id ?? undefined,
      type: row.type as Product['type'],
      unitId: row.unit_id,
      unitCode: (
        this.db.prepare('SELECT code FROM units WHERE id = ?').get(row.unit_id) as { code: string }
      ).code,
      price: row.price,
      cost: row.cost,
      taxId: row.tax_id ?? undefined,
      taxBps: row.tax_rate ?? 0,
      trackStock: row.track_stock === 1,
      stockOnHand: this.onHand(row.id),
      lowStockThreshold: row.low_stock_threshold ?? undefined,
      isWeighted: row.is_weighted === 1,
      isActive: row.is_active === 1,
      tags: JSON.parse(row.tags ?? '[]') as string[],
      variants: variants.map((v) => this.toVariant(v)),
      modifierGroupIds: (
        this.db
          .prepare('SELECT group_id FROM product_modifier_groups WHERE product_id = ?')
          .all(row.id) as { group_id: string }[]
      ).map((r) => r.group_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private toVariant(v: VariantRow): ProductVariant {
    return {
      id: v.id,
      productId: v.product_id,
      sku: v.sku,
      barcode: v.barcode ?? undefined,
      name: v.name,
      attributes: JSON.parse(v.attributes) as Record<string, string>,
      price: v.price,
      cost: v.cost,
      stockOnHand: this.onHand(v.product_id, v.id),
      isActive: v.is_active === 1
    }
  }
}

interface ProductRow {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  category_id: string | null
  brand_id: string | null
  type: string
  unit_id: string
  price: number
  cost: number
  tax_id: string | null
  tax_rate: number | null
  track_stock: number
  low_stock_threshold: number | null
  is_weighted: number
  is_active: number
  image_path: string | null
  tags: string
  created_at: string
  updated_at: string
}

interface VariantRow {
  id: string
  product_id: string
  sku: string
  barcode: string | null
  name: string
  attributes: string
  price: number
  cost: number
  is_active: number
}
