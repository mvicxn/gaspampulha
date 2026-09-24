import type { OrderConfirmation } from "../../shared/types.ts";
import { generatePublicCode } from "./code.ts";
import type { OrderInput } from "./input.ts";

export interface StockProduct {
  id: number;
  name: string;
  price_cents: number;
  active: number;
}

export type PricedOrder =
  | { ok: true; totalCents: number; lines: OrderConfirmation["items"] }
  | { ok: false; reason: "missing_product" };

export function priceOrder(input: OrderInput, products: StockProduct[]): PricedOrder {
  const lines: OrderConfirmation["items"] = [];
  let totalCents = 0;
  for (const item of input.items) {
    const product = products.find((entry) => entry.id === item.productId && entry.active === 1);
    if (!product) return { ok: false, reason: "missing_product" };
    totalCents += product.price_cents * item.quantity;
    lines.push({
      productId: product.id,
      productName: product.name,
      unitPriceCents: product.price_cents,
      quantity: item.quantity,
    });
  }
  return { ok: true, totalCents, lines };
}

export interface StoredOrder extends OrderConfirmation {
  idempotencyKey: string;
}

function confirmation(order: StoredOrder): OrderConfirmation {
  return {
    publicCode: order.publicCode,
    status: "novo",
    paymentStatus: "pendente",
    paymentMethod: order.paymentMethod,
    totalCents: order.totalCents,
    items: order.items,
  };
}

function sameCart(existing: StoredOrder, lines: OrderConfirmation["items"], paymentMethod: string): boolean {
  if (existing.paymentMethod !== paymentMethod || existing.items.length !== lines.length) return false;
  return lines.every((line) =>
    existing.items.some(
      (item) => item.productId === line.productId && item.quantity === line.quantity,
    ),
  );
}

function constraintOf(error: unknown): "idempotency" | "public_code" | null {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("idempotency_key")) return "idempotency";
  if (message.includes("public_code")) return "public_code";
  return null;
}

async function readOrder(db: D1Database, idempotencyKey: string): Promise<StoredOrder | null> {
  const order = await db
    .prepare(
      `SELECT id, public_code, payment_method, total_cents
       FROM orders WHERE idempotency_key = ?`,
    )
    .bind(idempotencyKey)
    .first<{ id: number; public_code: string; payment_method: StoredOrder["paymentMethod"]; total_cents: number }>();
  if (!order) return null;
  const items = await db
    .prepare(
      `SELECT product_id, product_name, unit_price_cents, qty
       FROM order_items WHERE order_id = ?`,
    )
    .bind(order.id)
    .all<{ product_id: number; product_name: string; unit_price_cents: number; qty: number }>();
  return {
    idempotencyKey,
    publicCode: order.public_code,
    status: "novo",
    paymentStatus: "pendente",
    paymentMethod: order.payment_method,
    totalCents: order.total_cents,
    items: items.results.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.qty,
    })),
  };
}

export async function placeOrder(
  db: D1Database,
  input: OrderInput,
  products: StockProduct[],
  requestId: string,
  now = new Date(),
): Promise<
  | { ok: true; replay: boolean; order: OrderConfirmation }
  | { ok: false; status: 400 | 409 }
> {
  const priced = priceOrder(input, products);
  if (!priced.ok) return { ok: false, status: 400 };
  const stamp = now.toISOString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicCode = generatePublicCode();
    const eventId = crypto.randomUUID();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO orders (
              public_code, idempotency_key, customer_name, phone, street, number, neighborhood,
              complement, reference, city, notes, status, payment_method, payment_status,
              total_cents, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, 'pendente', ?, ?, ?)`,
          )
          .bind(
            publicCode,
            input.idempotencyKey,
            input.customer.name,
            input.customer.phone,
            input.address.street,
            input.address.number,
            input.address.neighborhood,
            input.address.complement,
            input.address.reference,
            input.address.city,
            input.notes,
            input.paymentMethod,
            priced.totalCents,
            stamp,
            stamp,
          ),
        ...priced.lines.map((line) =>
          db
            .prepare(
              `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, qty)
               VALUES (last_insert_rowid(), ?, ?, ?, ?)`,
            )
            .bind(line.productId, line.productName, line.unitPriceCents, line.quantity),
        ),
        db
          .prepare(
            `INSERT INTO audit_events (
              event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
              outcome, request_id, ip_hash, user_agent_hash, metadata_json
            ) VALUES (?, ?, 'public', NULL, 'ORDER_CREATED', 'order', ?, 'success', ?, NULL, NULL, ?)`,
          )
          .bind(
            eventId,
            stamp,
            publicCode,
            requestId,
            JSON.stringify({
              item_count: priced.lines.length,
              total_cents: priced.totalCents,
              payment_method: input.paymentMethod,
            }),
          ),
      ]);
      return {
        ok: true,
        replay: false,
        order: {
          publicCode,
          status: "novo",
          paymentStatus: "pendente",
          paymentMethod: input.paymentMethod,
          totalCents: priced.totalCents,
          items: priced.lines,
        },
      };
    } catch (error) {
      const constraint = constraintOf(error);
      if (constraint === "public_code") continue;
      if (constraint === "idempotency") {
        const existing = await readOrder(db, input.idempotencyKey);
        if (!existing) throw error;
        if (!sameCart(existing, priced.lines, input.paymentMethod)) return { ok: false, status: 409 };
        return { ok: true, replay: true, order: confirmation(existing) };
      }
      throw error;
    }
  }
  throw new Error("public_code_exhausted");
}
