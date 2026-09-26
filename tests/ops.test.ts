import assert from "node:assert/strict";
import test from "node:test";
import { toPublicCatalog, type CatalogRow } from "../worker/catalog.ts";
import { buildDeliveryText, buildWaLink } from "../worker/admin/delivery.ts";
import { handleAdmin } from "../worker/admin/http.ts";

test("link do entregador só aceita dígitos e não usa url arbitrária", () => {
  const text = buildDeliveryText({
    publicCode: "AB12CD34",
    customerName: "Ana",
    phone: "31999990000",
    address: { street: "Rua A", number: "10", neighborhood: "Centro", city: "BH", reference: "mercado" },
    notes: "sem gelo",
    paymentMethod: "pix",
    totalLabel: "R$ 18,00",
    lines: [{ qty: 2, name: "Galão" }],
  });
  assert.equal(text.startsWith("🚚 PEDIDO AB12CD34"), true);
  assert.equal(text.includes("2 x Galão"), true);
  assert.equal(text.includes("id interno"), false);
  const link = buildWaLink("5531999990000", text);
  assert.equal(link?.startsWith("https://web.whatsapp.com/send?phone=5531999990000&text="), true);
  assert.equal(link?.includes("whatsapp://"), false);
  assert.equal(decodeURIComponent(link?.split("text=")[1] ?? "").includes("Ana"), true);
  assert.equal(buildWaLink("https://evil.test", text), null);
  assert.equal(buildWaLink("javascript:alert(1)", text), null);
});

test("número do entregador não entra no catálogo público", () => {
  const catalog = toPublicCatalog([] as CatalogRow[], {
    store_name: "Loja",
    whatsapp_number: "5531988880000",
    delivery_whatsapp_number: "553188887777",
  });
  assert.equal(JSON.stringify(catalog).includes("553188887777"), false);
  assert.equal(catalog.store.whatsapp, "5531988880000");
});

test("auditoria sem sessão responde 401", async () => {
  const response = await handleAdmin(
    new Request("https://loja.test/api/admin/audit?limit=999999"),
    {
      DB: { prepare() { throw new Error("nao"); } } as unknown as D1Database,
      TURNSTILE_SECRET: "present",
      AUDIT_HASH_SALT: "present",
    },
    "req-audit",
  );
  assert.equal(response.status, 401);
  const body = (await response.json()) as { request_id: string };
  assert.equal(body.request_id, "req-audit");
});
