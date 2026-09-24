import type { CheckoutDraft, PublicProduct } from "../shared/types.ts";

export interface CartItem {
  productId: number;
  quantity: number;
}

export const CART_MIN = 1;
export const CART_MAX = 20;

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= CART_MIN && quantity <= CART_MAX;
}

function same(items: CartItem[]): CartItem[] {
  return items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
}

export function addItem(items: CartItem[], productId: number, quantity = 1): CartItem[] {
  if (!Number.isInteger(productId) || productId <= 0 || !isValidQuantity(quantity)) return same(items);
  const next = same(items);
  const found = next.find((item) => item.productId === productId);
  if (!found) {
    next.push({ productId, quantity });
    return next;
  }
  found.quantity = Math.min(CART_MAX, found.quantity + quantity);
  return next;
}

export function increaseItem(items: CartItem[], productId: number): CartItem[] {
  return addItem(items, productId, 1);
}

export function decreaseItem(items: CartItem[], productId: number): CartItem[] {
  return same(items).map((item) =>
    item.productId === productId ? { ...item, quantity: Math.max(CART_MIN, item.quantity - 1) } : item,
  );
}

export function removeItem(items: CartItem[], productId: number): CartItem[] {
  return same(items).filter((item) => item.productId !== productId);
}

export function clearCart(): CartItem[] {
  return [];
}

export function reconcileCart(items: CartItem[], products: PublicProduct[]): CartItem[] {
  const active = new Set(products.map((product) => product.id));
  return same(items).filter((item) => active.has(item.productId) && isValidQuantity(item.quantity));
}

export function calculateDisplayTotal(items: CartItem[], products: PublicProduct[]): number {
  const prices = new Map(products.map((product) => [product.id, product.price_cents]));
  let total = 0;
  for (const item of items) {
    const price = prices.get(item.productId);
    if (price === undefined || !isValidQuantity(item.quantity)) continue;
    total += price * item.quantity;
  }
  return total;
}

export function toCheckoutDraft(items: CartItem[]): CheckoutDraft {
  return {
    items: reconcileQuantity(items).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };
}

function reconcileQuantity(items: CartItem[]): CartItem[] {
  return items.filter((item) => isValidQuantity(item.quantity));
}

export function parseStoredCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CartItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const productId = (entry as { productId?: unknown }).productId;
    const quantity = (entry as { quantity?: unknown }).quantity;
    if (typeof productId !== "number" || typeof quantity !== "number") continue;
    if (!Number.isInteger(productId) || productId <= 0 || !isValidQuantity(quantity)) continue;
    items.push({ productId, quantity });
  }
  return items;
}

export function formatBrl(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}R$ ${grouped},${frac}`;
}
