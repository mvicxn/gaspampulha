import assert from "node:assert/strict";
import test from "node:test";
import { toPublicCatalog, type CatalogRow } from "../worker/catalog.ts";
import {
  canonicalPix,
  canonicalWhatsapp,
  cleanLabel,
  parseActive,
  parsePrice,
  parseSort,
} from "../worker/admin/manage.ts";
import { formatLog } from "../worker/log.ts";

test("produto rejeita preço, categoria, nome, ordem e active fora do contrato", () => {
  assert.equal(parsePrice(11.5), null);
  assert.equal(parsePrice(-1), null);
  assert.equal(parsePrice(Number.NaN), null);
  assert.equal(parsePrice(11500), 11500);
  assert.equal(parseSort(10000), null);
  assert.equal(parseSort(2), 2);
  assert.equal(parseActive("true"), null);
  assert.equal(parseActive(false), 0);
  assert.equal(cleanLabel("<script>", 80), null);
  assert.equal(cleanLabel("Robert'); DROP TABLE products;--", 80)?.includes("DROP"), true);
  assert.equal(canonicalWhatsapp("javascript:alert(1)"), null);
  assert.equal(canonicalWhatsapp("https://wa.me/5531"), null);
  assert.equal(canonicalWhatsapp("(31) 99999-0000"), "31999990000");
  assert.equal(canonicalPix("data:text/html,hi"), null);
  assert.equal(canonicalPix("loja@example.com"), "loja@example.com");
});

test("catálogo some com inativo e o pedido guarda o preço antigo", () => {
  const rows: CatalogRow[] = [
    { id: 1, name: "Galão", category: "agua", price_cents: 12000, active: 1, sort_order: 2 },
    { id: 2, name: "Alfa", category: "agua", price_cents: 1000, active: 1, sort_order: 2 },
    { id: 3, name: "Fora", category: "gas", price_cents: 1, active: 0, sort_order: 0 },
  ];
  const catalog = toPublicCatalog(rows, { store_name: "Loja Nova", whatsapp_number: "5531999990000" });
  assert.deepEqual(
    catalog.categories.agua.map((item) => item.name),
    ["Alfa", "Galão"],
  );
  assert.equal(catalog.categories.gas.length, 0);
  assert.equal(catalog.categories.agua[1]?.price_cents, 12000);
  const historical = { unitPriceCents: 11500 };
  rows[0].price_cents = 12000;
  assert.equal(historical.unitPriceCents, 11500);
});

test("log não leva a chave pix", () => {
  const line = formatLog({
    request_id: "req",
    timestamp: "2026-01-01T00:00:00.000Z",
    event: "SETTINGS_UPDATE_SUCCESS",
    level: "info",
    pix_key: "chave-secreta",
    whatsapp_number: "31999990000",
  } as never);
  assert.equal(line.includes("chave-secreta"), false);
  assert.equal(line.includes("31999990000"), false);
});
