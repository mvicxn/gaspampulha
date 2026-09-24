import type { PaymentMethod } from "../../shared/types.ts";

export const orderLimits = {
  items: 20,
  name: 80,
  phoneDigits: { min: 10, max: 13 },
  street: 120,
  number: 20,
  neighborhood: 80,
  complement: 80,
  reference: 120,
  city: 80,
  notes: 300,
  turnstile: 2048,
} as const;

const PAYMENTS = ["pix", "dinheiro", "cartao"] as const;

export interface OrderItemInput {
  productId: number;
  quantity: number;
}

export interface OrderInput {
  items: OrderItemInput[];
  customer: { name: string; phone: string };
  address: {
    street: string;
    number: string;
    neighborhood: string;
    complement: string;
    reference: string;
    city: string;
  };
  notes: string;
  paymentMethod: PaymentMethod;
  turnstileToken: string;
  idempotencyKey: string;
}

export type OrderParse = { ok: true; value: OrderInput } | { ok: false; errors: string[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string, errors: string[]) {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (extra.length > 0) errors.push(`${label} campos inesperados: ${extra.join(",")}`);
  if (missing.length > 0) errors.push(`${label} faltam campos: ${missing.join(",")}`);
}

function text(value: unknown, max: number, required: boolean, label: string, errors: string[]): string {
  if (typeof value !== "string") {
    errors.push(`${label} inválido`);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length > max || (required && trimmed.length === 0)) errors.push(`${label} tamanho inválido`);
  return trimmed;
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function parseOrder(input: unknown): OrderParse {
  const errors: string[] = [];
  if (!record(input)) return { ok: false, errors: ["corpo inválido"] };
  exact(
    input,
    ["items", "customer", "address", "notes", "paymentMethod", "turnstileToken", "idempotencyKey"],
    "pedido",
    errors,
  );
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > orderLimits.items) {
    errors.push("items inválido");
  }
  const items: OrderItemInput[] = [];
  const seen = new Set<number>();
  if (Array.isArray(input.items)) {
    for (const entry of input.items) {
      if (!record(entry)) {
        errors.push("item inválido");
        continue;
      }
      exact(entry, ["productId", "quantity"], "item", errors);
      const productId = entry.productId;
      const quantity = entry.quantity;
      if (typeof productId !== "number" || !Number.isInteger(productId) || productId <= 0) {
        errors.push("productId inválido");
      }
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        errors.push("quantity inválida");
      }
      if (typeof productId === "number" && seen.has(productId)) errors.push("produto repetido");
      if (typeof productId === "number") seen.add(productId);
      if (typeof productId === "number" && typeof quantity === "number") items.push({ productId, quantity });
    }
  }
  if (!record(input.customer)) errors.push("customer inválido");
  else exact(input.customer, ["name", "phone"], "customer", errors);
  const name = record(input.customer) ? text(input.customer.name, orderLimits.name, true, "name", errors) : "";
  const phoneRaw = record(input.customer) ? text(input.customer.phone, 20, true, "phone", errors) : "";
  const phone = normalizePhone(phoneRaw);
  if (phone.length < orderLimits.phoneDigits.min || phone.length > orderLimits.phoneDigits.max) {
    errors.push("phone inválido");
  }
  if (!record(input.address)) errors.push("address inválido");
  else exact(input.address, ["street", "number", "neighborhood", "complement", "reference", "city"], "address", errors);
  const address = record(input.address) ? input.address : {};
  const street = text(address.street, orderLimits.street, true, "street", errors);
  const number = text(address.number, orderLimits.number, true, "number", errors);
  const neighborhood = text(address.neighborhood, orderLimits.neighborhood, true, "neighborhood", errors);
  const complement = text(address.complement, orderLimits.complement, false, "complement", errors);
  const reference = text(address.reference, orderLimits.reference, false, "reference", errors);
  const city = text(address.city, orderLimits.city, true, "city", errors);
  const notes = text(input.notes, orderLimits.notes, false, "notes", errors);
  if (typeof input.paymentMethod !== "string" || !PAYMENTS.includes(input.paymentMethod as PaymentMethod)) {
    errors.push("paymentMethod inválido");
  }
  const turnstileToken = text(input.turnstileToken, orderLimits.turnstile, true, "turnstileToken", errors);
  const idempotencyKey = text(input.idempotencyKey, 36, true, "idempotencyKey", errors);
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) errors.push("idempotencyKey inválido");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      items,
      customer: { name, phone },
      address: { street, number, neighborhood, complement, reference, city },
      notes,
      paymentMethod: input.paymentMethod as PaymentMethod,
      turnstileToken,
      idempotencyKey,
    },
  };
}
