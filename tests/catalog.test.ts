import assert from "node:assert/strict";
import test from "node:test";
import type { CheckoutDraft } from "../shared/types.ts";
import {
  addItem,
  calculateDisplayTotal,
  clearCart,
  decreaseItem,
  increaseItem,
  parseStoredCart,
  reconcileCart,
  removeItem,
  toCheckoutDraft,
} from "../src/cart.ts";
import { SEED_EXAMPLE_WHATSAPP, toPublicCatalog, type CatalogRow } from "../worker/catalog.ts";

function row(partial: Partial<CatalogRow> & Pick<CatalogRow, "id" | "name" | "category">): CatalogRow {
  return {
    price_cents: 1000,
    active: 1,
    sort_order: 1,
    ...partial,
  };
}

test("catálogo vazio e só settings públicas", () => {
  const catalog = toPublicCatalog([], { store_name: "Loja", whatsapp_number: "5531", pix_key: "segredo" });
  assert.deepEqual(catalog.categories, { agua: [], gas: [] });
  assert.deepEqual(catalog.store, { name: "Loja", whatsapp: "5531", serviceArea: "", openingHours: "" });
  assert.equal(JSON.stringify(catalog).includes("pix_key"), false);
  assert.equal(JSON.stringify(catalog).includes("segredo"), false);
});

test("catálogo omite inativo e ordena", () => {
  const catalog = toPublicCatalog(
    [
      row({ id: 3, name: "Zulu", category: "agua", sort_order: 2, price_cents: 500 }),
      row({ id: 2, name: "Alfa", category: "agua", sort_order: 2, price_cents: 700 }),
      row({ id: 1, name: "Fora", category: "gas", active: 0, sort_order: 0, price_cents: 1 }),
      row({ id: 4, name: "P13", category: "gas", sort_order: 1, price_cents: 11000 }),
    ],
    {},
  );
  assert.deepEqual(
    catalog.categories.agua.map((item) => item.name),
    ["Alfa", "Zulu"],
  );
  assert.deepEqual(catalog.categories.gas.map((item) => item.id), [4]);
  assert.equal("active" in catalog.categories.agua[0], false);
  assert.equal("sort_order" in catalog.categories.agua[0], false);
});

test("carrinho adiciona, limita, remove e soma centavos do catálogo", () => {
  const products = toPublicCatalog(
    [row({ id: 1, name: "Galão", category: "agua", price_cents: 1800 })],
    {},
  ).categories.agua;
  let items = addItem([], 1, 2);
  items = increaseItem(items, 1);
  assert.equal(items[0]?.quantity, 3);
  items = addItem(items, 1, 17);
  assert.equal(items[0]?.quantity, 20);
  items = addItem(items, 1, 1);
  assert.equal(items[0]?.quantity, 20);
  assert.deepEqual(addItem([], 1, 30), []);
  items = decreaseItem(items, 1);
  assert.equal(items[0]?.quantity, 19);
  items = decreaseItem([{ productId: 1, quantity: 1 }], 1);
  assert.equal(items[0]?.quantity, 1);
  assert.deepEqual(addItem([], 1, 0), []);
  assert.deepEqual(addItem([], 1, 1.5), []);
  assert.deepEqual(addItem([], 1, Number.NaN), []);
  assert.equal(calculateDisplayTotal([{ productId: 1, quantity: 2 }], products), 3600);
  assert.deepEqual(removeItem([{ productId: 1, quantity: 2 }], 1), []);
  assert.deepEqual(clearCart(), []);
});

test("reconcilia inativo e ignora preço gravado no navegador", () => {
  const active = toPublicCatalog(
    [row({ id: 1, name: "Galão", category: "agua", price_cents: 1800 })],
    {},
  ).categories.agua;
  const stored = parseStoredCart([
    { productId: 1, quantity: 2, price_cents: 1 },
    { productId: 9, quantity: 1, price: 999 },
    { productId: 1, quantity: 0 },
  ]);
  assert.deepEqual(stored, [
    { productId: 1, quantity: 2 },
    { productId: 9, quantity: 1 },
  ]);
  assert.equal("price_cents" in stored[0], false);
  const reconciled = reconcileCart(
    [
      { productId: 1, quantity: 2 },
      { productId: 9, quantity: 1 },
    ],
    active,
  );
  assert.deepEqual(reconciled, [{ productId: 1, quantity: 2 }]);
  assert.equal(calculateDisplayTotal(stored, active), 3600);
  const draft: CheckoutDraft = toCheckoutDraft(reconciled);
  assert.deepEqual(draft, { items: [{ productId: 1, quantity: 2 }] });
  assert.equal(JSON.stringify(draft).includes("price"), false);
});

test("catálogo publica área e horário e esconde o WhatsApp de exemplo do seed", () => {
  const catalog = toPublicCatalog([], {
    store_name: "Loja",
    whatsapp_number: SEED_EXAMPLE_WHATSAPP,
    service_area: "Centro",
    opening_hours: "Seg a sáb",
  });
  assert.deepEqual(catalog.store, { name: "Loja", whatsapp: "", serviceArea: "Centro", openingHours: "Seg a sáb" });
});
