import assert from "node:assert/strict";
import test from "node:test";
import { generatePublicCode, isPublicCode } from "../worker/orders/code.ts";
import { placeOrder, priceOrder, type StockProduct } from "../worker/orders/create.ts";
import { handleOrder } from "../worker/orders/http.ts";
import { parseOrder, type OrderInput } from "../worker/orders/input.ts";
import { verifyTurnstile } from "../worker/orders/turnstile.ts";
import { formatLog } from "../worker/log.ts";

const product: StockProduct = { id: 1, name: "Galão 20 litros", price_cents: 1800, active: 1 };

function order(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [{ productId: 1, quantity: 2 }],
    customer: { name: "Ana", phone: "(31) 99999-0000" },
    address: {
      street: "Rua A",
      number: "10",
      neighborhood: "Centro",
      complement: "",
      reference: "mercado",
      city: "Belo Horizonte",
    },
    notes: "",
    paymentMethod: "pix",
    turnstileToken: "token-ok",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    ...extra,
  };
}

function parsedOrder(extra: Record<string, unknown> = {}): OrderInput {
  const result = parseOrder(order(extra));
  if (!result.ok) throw new Error(result.errors.join(","));
  return result.value;
}

test("rejeita contrato inválido e campo de preço", () => {
  assert.equal(parseOrder(null).ok, false);
  assert.equal(parseOrder(order({ total: 1 })).ok, false);
  assert.equal(parseOrder(order({ price: 1 })).ok, false);
  assert.equal(parseOrder(order({ status: "pago" })).ok, false);
  assert.equal(parseOrder(order({ paymentStatus: "pago" })).ok, false);
  assert.equal(parseOrder(order({ productName: "falso" })).ok, false);
  assert.equal(parseOrder(order({ items: [] })).ok, false);
  assert.equal(parseOrder(order({ items: [{ productId: 1, quantity: 0 }] })).ok, false);
  assert.equal(parseOrder(order({ items: [{ productId: 1, quantity: -1 }] })).ok, false);
  assert.equal(parseOrder(order({ items: [{ productId: 1, quantity: 1.5 }] })).ok, false);
  assert.equal(parseOrder(order({ items: [{ productId: 1, quantity: 21 }] })).ok, false);
  assert.equal(parseOrder(order({ paymentMethod: "boleto" })).ok, false);
  assert.equal(parseOrder(order({ customer: { name: "A".repeat(81), phone: "31999990000" } })).ok, false);
  const many = Array.from({ length: 21 }, (_, index) => ({ productId: index + 1, quantity: 1 }));
  assert.equal(parseOrder(order({ items: many })).ok, false);
  const sql = parsedOrder({ customer: { name: "Robert'); DROP TABLE orders;--", phone: "31999990000" } });
  assert.equal(sql.customer.name.includes("DROP TABLE"), true);
});

test("preço vem do produto ativo e o snapshot não muda com o preço novo", () => {
  const first = priceOrder(parsedOrder(), [product]);
  assert.equal(first.ok && first.totalCents, 3600);
  assert.equal(first.ok && first.lines[0]?.unitPriceCents, 1800);
  const inactive = priceOrder(parsedOrder(), [{ ...product, active: 0 }]);
  assert.equal(inactive.ok, false);
  const missing = priceOrder(parsedOrder({ items: [{ productId: 9, quantity: 1 }] }), [product]);
  assert.equal(missing.ok, false);
  const later = priceOrder(parsedOrder(), [{ ...product, price_cents: 9999, name: "Outro nome" }]);
  assert.equal(first.ok && later.ok && first.lines[0]?.productName, "Galão 20 litros");
  assert.equal(later.ok && later.lines[0]?.unitPriceCents, 9999);
});

function memoryDb() {
  const orders: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let fail: "item" | "audit" | null = null;
  const db = {
    orders,
    items,
    audits,
    failOn(next: "item" | "audit" | null) {
      fail = next;
    },
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            sql,
            args,
            async first() {
              const key = args[0];
              return orders.find((row) => row.idempotency_key === key) ?? null;
            },
            async all() {
              const orderId = args[0];
              return { results: items.filter((row) => row.order_id === orderId) };
            },
          };
        },
      };
    },
    async batch(statements: Array<{ sql: string; args: unknown[] }>) {
      const stagedOrders: Array<Record<string, unknown>> = [];
      const stagedItems: Array<Record<string, unknown>> = [];
      const stagedAudits: Array<Record<string, unknown>> = [];
      for (const statement of statements) {
        if (fail === "item" && statement.sql.includes("order_items")) throw new Error("insert item");
        if (fail === "audit" && statement.sql.includes("audit_events")) throw new Error("audit");
        if (statement.sql.includes("INSERT INTO orders")) {
          const key = statement.args[1];
          if ([...orders, ...stagedOrders].some((row) => row.idempotency_key === key)) {
            throw new Error("UNIQUE constraint failed: orders.idempotency_key");
          }
          if (statement.sql.includes(String(statement.args[2]))) {
            throw new Error("sql concatenou entrada");
          }
          stagedOrders.push({
            id: orders.length + stagedOrders.length + 1,
            public_code: statement.args[0],
            idempotency_key: key,
            payment_method: statement.args[11],
            total_cents: statement.args[12],
          });
        } else if (statement.sql.includes("order_items")) {
          stagedItems.push({
            order_id: stagedOrders[0]?.id,
            product_id: statement.args[0],
            product_name: statement.args[1],
            unit_price_cents: statement.args[2],
            qty: statement.args[3],
          });
        } else if (statement.sql.includes("audit_events")) {
          stagedAudits.push({
            resource_id: statement.args[2],
            metadata: statement.args[4],
          });
        }
      }
      orders.push(...stagedOrders);
      items.push(...stagedItems);
      audits.push(...stagedAudits);
    },
  };
  return db;
}

test("idempotência, snapshot e rollback ficam no mesmo batch", async () => {
  const db = memoryDb();
  const input = parsedOrder();
  const created = await placeOrder(db as unknown as D1Database, input, [product], "req-1");
  const replay = await placeOrder(db as unknown as D1Database, input, [product], "req-2");
  assert.equal(created.ok, true);
  assert.equal(replay.ok, true);
  if (created.ok && replay.ok) assert.equal(created.order.publicCode, replay.order.publicCode);
  assert.equal(replay.ok && replay.replay, true);
  assert.equal(db.orders.length, 1);
  assert.equal(db.audits.length, 1);
  assert.equal(String(db.audits[0]?.metadata).includes("31999990000"), false);
  const other = parsedOrder({ items: [{ productId: 1, quantity: 1 }] });
  const conflict = await placeOrder(db as unknown as D1Database, other, [product], "req-3");
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.status, 409);
  assert.equal(db.orders.length, 1);

  const broken = memoryDb();
  broken.failOn("item");
  await assert.rejects(placeOrder(broken as unknown as D1Database, parsedOrder({ idempotencyKey: "22222222-2222-4222-8222-222222222222" }), [product], "req"));
  assert.equal(broken.orders.length, 0);
  assert.equal(broken.audits.length, 0);
  broken.failOn("audit");
  await assert.rejects(placeOrder(broken as unknown as D1Database, parsedOrder({ idempotencyKey: "33333333-3333-4333-8333-333333333333" }), [product], "req"));
  assert.equal(broken.orders.length, 0);
});

test("public_code não é sequencial", () => {
  const codes = new Set(Array.from({ length: 200 }, () => generatePublicCode()));
  assert.equal(codes.size > 190, true);
  for (const code of codes) {
    assert.equal(isPublicCode(code), true);
    assert.equal(/^\d+$/.test(code), false);
  }
  assert.equal(isPublicCode("ORDER-1"), false);
});

test("turnstile ausente ou inválido não passa e o token não vai para o log", async () => {
  const missing = await verifyTurnstile({ token: "", secret: "secret", fetcher: fetch });
  assert.equal(missing, false);
  const rejected = await verifyTurnstile({
    token: "bad",
    secret: "secret",
    hostname: "loja.test",
    action: "order",
    fetcher: async () => Response.json({ success: false }),
  });
  assert.equal(rejected, false);
  const accepted = await verifyTurnstile({
    token: "good",
    secret: "secret",
    hostname: "loja.test",
    action: "order",
    fetcher: async () => Response.json({ success: true, hostname: "loja.test", action: "order" }),
  });
  assert.equal(accepted, true);
  const line = formatLog({
    request_id: "req",
    timestamp: "2026-01-01T00:00:00.000Z",
    event: "ORDER_CREATE_SUCCESS",
    level: "info",
    turnstileToken: "segredo",
  } as never);
  assert.equal(line.includes("segredo"), false);
});

test("handleOrder rejeita conteúdo inválido antes do banco", async () => {
  const db = { prepare() { throw new Error("nao deveria consultar"); } };
  const response = await handleOrder(
    new Request("https://loja.test/api/orders", { method: "POST", body: "{" }),
    { DB: db as unknown as D1Database, TURNSTILE_SECRET: "secret" },
    "req",
  );
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { request_id?: string; error?: string };
  assert.equal(payload.request_id, "req");
  assert.equal(JSON.stringify(payload).includes("Syntax"), false);
});
