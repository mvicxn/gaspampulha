export function buildDeliveryText(order: {
  publicCode: string;
  customerName: string;
  phone: string;
  address: { street: string; number: string; neighborhood: string; city: string; reference: string };
  notes: string;
  paymentMethod: string;
  totalLabel: string;
  lines: Array<{ qty: number; name: string }>;
}): string {
  const products = order.lines.map((line) => `- ${line.qty} x ${line.name}`).join("\n");
  return [
    `🚚 PEDIDO ${order.publicCode}`,
    "",
    "Cliente:",
    order.customerName,
    "Telefone:",
    order.phone,
    "",
    "Endereço:",
    `${order.address.street}, ${order.address.number}`,
    order.address.neighborhood,
    order.address.city,
    "",
    "Referência:",
    order.address.reference || "-",
    "",
    "Produtos:",
    products,
    "",
    "Total:",
    order.totalLabel,
    "Pagamento:",
    order.paymentMethod,
    "",
    "Observação:",
    order.notes || "-",
  ].join("\n");
}

export function buildWaLink(digits: string, text: string): string | null {
  if (!/^\d{10,13}$/.test(digits)) return null;
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
}
