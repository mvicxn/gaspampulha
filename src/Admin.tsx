import { useEffect, useState } from "react";
import type { OrderStatus, PaymentStatus } from "../shared/types.ts";
import { formatBrl } from "./cart.ts";
import { canChangeOrderStatus, canChangePaymentStatus } from "../worker/order-status.ts";
import AdminNav from "./AdminNav.tsx";

interface AdminItem {
  productName: string;
  unitPriceCents: number;
  qty: number;
}

interface AdminOrder {
  id: number;
  publicCode: string;
  customerName: string;
  phone: string;
  address: { street: string; number: string; neighborhood: string; city: string; reference: string };
  notes: string;
  status: OrderStatus;
  paymentMethod: "pix" | "dinheiro" | "cartao";
  paymentStatus: PaymentStatus;
  totalCents: number;
  createdAt: string;
  items: AdminItem[];
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  novo: "NOVO",
  confirmado: "CONFIRMADO",
  preparando: "PREPARANDO",
  saiu: "SAIU",
  entregue: "ENTREGUE",
  cancelado: "CANCELADO",
};

const NEXT: Record<OrderStatus, OrderStatus | null> = {
  novo: "confirmado",
  confirmado: "preparando",
  preparando: "saiu",
  saiu: "entregue",
  entregue: null,
  cancelado: null,
};

export default function Admin() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [query, setQuery] = useState("");
  const [csrf, setCsrf] = useState(sessionStorage.getItem("gaspampulha.csrf") ?? "");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(nextStatus = status, nextPayment = payment, nextQuery = query) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (nextPayment) params.set("paymentStatus", nextPayment);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const response = await fetch(`/api/admin/orders?${params.toString()}`);
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { request_id?: string };
      setRequestId(data.request_id ?? "");
      setError("Não foi possível carregar os pedidos.");
      setLoading(false);
      return;
    }
    const data = (await response.json()) as { orders: AdminOrder[] };
    setOrders(data.orders);
    setError("");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: number, body: { status: OrderStatus } | { paymentStatus: PaymentStatus }) {
    const response = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": csrf, origin: window.location.origin },
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { request_id?: string };
      setRequestId(data.request_id ?? "");
      setError("Não foi possível atualizar o pedido.");
      await load();
      return;
    }
    const data = (await response.json()) as { csrfToken: string };
    sessionStorage.setItem("gaspampulha.csrf", data.csrfToken);
    setCsrf(data.csrfToken);
    await load();
  }

  return (
    <main className="admin">
      <AdminNav />
      <header className="admin-bar">
        <h1>Pedidos</h1>
        <button type="button" onClick={() => void load()}>
          Atualizar pedidos
        </button>
        <button
          type="button"
          onClick={() => {
            void fetch("/api/admin/logout", {
              method: "POST",
              headers: { "content-type": "application/json", "x-csrf-token": csrf, origin: window.location.origin },
            }).then(() => {
              sessionStorage.removeItem("gaspampulha.csrf");
              window.location.assign("/admin/login");
            });
          }}
        >
          Sair
        </button>
      </header>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Buscar pedido"
          value={query}
          placeholder="Código, nome ou telefone"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>
      <div className="filters">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            void load(event.target.value, payment);
          }}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={payment}
          onChange={(event) => {
            setPayment(event.target.value);
            void load(status, event.target.value);
          }}
        >
          <option value="">Todo pagamento</option>
          <option value="pendente">PENDENTE</option>
          <option value="pago">PAGO</option>
        </select>
      </div>
      {loading ? <p className="muted">Carregando pedidos...</p> : null}
      {error ? (
        <p className="error-text">
          {error}
          {requestId ? <span className="muted"> Código de atendimento: {requestId}</span> : null}
        </p>
      ) : null}
      {!loading && orders.length === 0 ? <p className="muted">Nenhum pedido nesta fila.</p> : null}
      <div className="order-list">
        {orders.map((order) => {
          const next = NEXT[order.status];
          return (
            <article key={order.id} className={order.status === "novo" ? "order-card is-new" : "order-card"}>
              <p className="code">{order.publicCode}</p>
              <p>
                {order.customerName} · {order.phone}
              </p>
              <p>
                {order.address.street}, {order.address.number} · {order.address.neighborhood} · {order.address.city}
              </p>
              <ul>
                {order.items.map((item) => (
                  <li key={`${order.id}-${item.productName}`}>
                    {item.productName} · {item.qty} · {formatBrl(item.unitPriceCents * item.qty)}
                  </li>
                ))}
              </ul>
              <p className="total">{formatBrl(order.totalCents)}</p>
              <p>
                {STATUS_LABEL[order.status]} · {order.paymentStatus === "pago" ? "PAGO" : "PENDENTE"} ·{" "}
                {order.paymentMethod}
              </p>
              <p>{new Date(order.createdAt).toLocaleString("pt-BR")}</p>
              <div className="actions">
                {next && canChangeOrderStatus(order.status, next) ? (
                  <button type="button" onClick={() => void patch(order.id, { status: next })}>
                    {STATUS_LABEL[next]}
                  </button>
                ) : null}
                {canChangeOrderStatus(order.status, "cancelado") ? (
                  <button type="button" onClick={() => void patch(order.id, { status: "cancelado" })}>
                    CANCELADO
                  </button>
                ) : null}
                {canChangePaymentStatus(order.paymentStatus, "pago") ? (
                  <button type="button" onClick={() => void patch(order.id, { paymentStatus: "pago" })}>
                    Marcar pago
                  </button>
                ) : null}
                <button type="button" onClick={() => setOpenId(openId === order.id ? null : order.id)}>
                  {openId === order.id ? "Fechar detalhe" : "Abrir detalhe"}
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(order.publicCode)}
                >
                  Copiar código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void fetch(`/api/admin/orders/${order.id}/delivery-link`, {
                      method: "POST",
                      headers: { "x-csrf-token": csrf, origin: window.location.origin },
                    }).then(async (response) => {
                      if (!response.ok) {
                        const data = (await response.json().catch(() => ({}))) as { request_id?: string };
                        setRequestId(data.request_id ?? "");
                        setError("Não foi possível atualizar o pedido.");
                        return;
                      }
                      const data = (await response.json()) as { url: string; csrfToken: string };
                      sessionStorage.setItem("gaspampulha.csrf", data.csrfToken);
                      setCsrf(data.csrfToken);
                      window.open(data.url, "_blank", "noopener,noreferrer");
                    });
                  }}
                >
                  Enviar ao entregador
                </button>
              </div>
              {openId === order.id ? (
                <div>
                  <p>Referência: {order.address.reference || "-"}</p>
                  <p>Observação: {order.notes || "-"}</p>
                  {order.items.map((item) => (
                    <p key={`${order.id}-detail-${item.productName}`}>
                      {item.qty} x {item.productName} · {formatBrl(item.unitPriceCents)} ·{" "}
                      {formatBrl(item.unitPriceCents * item.qty)}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
