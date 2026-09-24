import type { CatalogResponse, ProductCategory, PublicProduct } from "../shared/types.ts";

export interface CatalogRow {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  active: number;
  sort_order: number;
}

const PUBLIC_SETTINGS = ["store_name", "whatsapp_number"] as const;

export function toPublicCatalog(
  rows: CatalogRow[],
  settings: Record<string, string>,
): CatalogResponse {
  const products = rows
    .filter(
      (row) =>
        row.active === 1 &&
        (row.category === "agua" || row.category === "gas") &&
        Number.isInteger(row.price_cents),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
  const categories: CatalogResponse["categories"] = { agua: [], gas: [] };
  for (const row of products) {
    const item: PublicProduct = {
      id: row.id,
      name: row.name,
      category: row.category as ProductCategory,
      price_cents: row.price_cents,
    };
    categories[item.category].push(item);
  }
  const storeName = settings.store_name ?? "";
  const whatsapp = settings.whatsapp_number ?? "";
  return {
    store: { name: storeName, whatsapp },
    categories,
  };
}

export async function loadCatalog(db: D1Database): Promise<CatalogResponse> {
  const products = await db
    .prepare(
      `SELECT id, name, category, price_cents, active, sort_order
       FROM products
       WHERE active = 1
       ORDER BY sort_order ASC, name ASC`,
    )
    .all<CatalogRow>();
  const settings = await db
    .prepare(
      `SELECT key, value FROM settings
       WHERE key IN ('store_name', 'whatsapp_number')`,
    )
    .all<{ key: string; value: string }>();
  const allowed = new Set<string>(PUBLIC_SETTINGS);
  const values: Record<string, string> = {};
  for (const row of settings.results) {
    if (allowed.has(row.key)) values[row.key] = row.value;
  }
  return toPublicCatalog(products.results, values);
}
