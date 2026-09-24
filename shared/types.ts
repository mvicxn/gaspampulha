export type ProductCategory = "agua" | "gas";

export type OrderStatus =
  | "novo"
  | "confirmado"
  | "preparando"
  | "saiu"
  | "entregue"
  | "cancelado";

export type PaymentMethod = "pix" | "dinheiro" | "cartao";

export type PaymentStatus = "pendente" | "pago";

export interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  price_cents: number;
  active: boolean;
  sort_order: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  qty: number;
}

export interface OrderAddress {
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  reference: string;
  city: string;
}

export interface Order {
  id: number;
  public_code: string;
  idempotency_key: string;
  customer_name: string;
  phone: string;
  address: OrderAddress;
  notes: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total_cents: number;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface HealthResponse {
  ok: true;
  service: "gaspampulha";
  turnstileSiteKey: string;
}

export interface PublicProduct {
  id: number;
  name: string;
  category: ProductCategory;
  price_cents: number;
}

export interface CatalogResponse {
  store: {
    name: string;
    whatsapp: string;
  };
  categories: {
    agua: PublicProduct[];
    gas: PublicProduct[];
  };
}

export interface CheckoutDraft {
  items: Array<{
    productId: number;
    quantity: number;
  }>;
}

export interface OrderConfirmation {
  publicCode: string;
  status: "novo";
  paymentStatus: "pendente";
  paymentMethod: PaymentMethod;
  totalCents: number;
  items: Array<{
    productId: number;
    productName: string;
    unitPriceCents: number;
    quantity: number;
  }>;
}
