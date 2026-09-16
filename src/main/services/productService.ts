import type { DB } from '../db/database'
import type { Product, ProductVariant, Paginated } from '@shared/types/models'
import { AppError, ErrorCode } from '@shared/lib/errors'

export class ProductService {
  constructor(
    private db: DB,
    private branchId: string
  ) {}

  get(idOrSku: string): Product {
    const row = this.db
      .prepare('SELECT * FROM products WHERE id = ? OR sku = ?')
      .get(idOrSku, idOrSku) as ProductRow | undefined
    if (!row) throw new AppError(ErrorCode.NotFound, `Product not found: ${idOrSku}`)
    return this.toProduct(row)
  }

  list(opts: { search?: string; categoryId?: string; limit?: number; offset?: number }): Paginated<Product> {
    const limit = opts.limit ?? 100
    const offset = opts.offset ?? 0
    const params: unknown[] = []
    let where = 'WHERE is_active = 1'
    if (opts.categoryId) {
      where += ' AND category_id = ?'
      params.push(opts.categoryId)
    }
    if (opts.search) {
      where += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'
      const like = `%${opts.search}%`
      params.push(like, like, like)
    }
    const total = (this.db.prepare(`SELECT COUNT(*) c FROM products ${where}`).get(...params) as { c: number }).c
    const rows = this.db
      .prepare(`SELECT * FROM products ${where} ORDER BY name LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as ProductRow[]
    return { items: rows.map((r) => this.toProduct(r)), total, limit, offset }
  }

  search(term: string, limit = 20): Product[] {
    const like = `%${term}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM products WHERE is_active = 1 AND (name LIKE ? OR sku LIKE ?) ORDER BY name LIMIT ?`
      )
      .all(like, like, limit) as ProductRow[]
    return rows.map((r) => this.toProduct(r))
  }

  byBarcode(barcode: string): Product | null {
    const row = this.db
      .prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1')
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
        `SELECT p.* FROM products p WHERE p.is_active = 1 AND p.track_stock = 1 AND p.low_stock_threshold IS NOT NULL`
      )
      .all() as ProductRow[]
    return rows.filter((r) => this.onHand(r.id) < (r.low_stock_threshold ?? 0)).map((r) => this.toProduct(r))
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
      unitCode: (this.db.prepare('SELECT code FROM units WHERE id = ?').get(row.unit_id) as { code: string }).code,
      price: row.price,
      cost: row.cost,
      taxId: row.tax_id ?? undefined,
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
  id: string; sku: string; barcode: string | null; name: string
  description: string | null; category_id: string | null; brand_id: string | null
  type: string; unit_id: string; price: number; cost: number; tax_id: string | null
  track_stock: number; low_stock_threshold: number | null; is_weighted: number
  is_active: number; image_path: string | null; tags: string; created_at: string; updated_at: string
}

interface VariantRow {
  id: string; product_id: string; sku: string; barcode: string | null
  name: string; attributes: string; price: number; cost: number; is_active: number
}
