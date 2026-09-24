import type { OrderStatus, PaymentStatus } from "../shared/types.ts";

const orderEdges: Record<OrderStatus, readonly OrderStatus[]> = {
  novo: ["confirmado", "cancelado"],
  confirmado: ["preparando", "cancelado"],
  preparando: ["saiu", "cancelado"],
  saiu: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export function canChangeOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return orderEdges[from].includes(to);
}

export function canChangePaymentStatus(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === "pendente" && to === "pago";
}
