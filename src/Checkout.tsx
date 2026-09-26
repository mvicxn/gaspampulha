import { useEffect, useRef, useState } from "react";
import SiteHeader from "./SiteHeader.tsx";
import type { CatalogResponse, OrderConfirmation, PaymentMethod } from "../shared/types.ts";
import { CART_KEY, calculateDisplayTotal, formatBrl, parseStoredCart, reconcileCart, type CartItem } from "./cart.ts";

const IDEMPOTENCY_KEY = "gaspampulha.idempotency";

function readCart(): CartItem[] {
  try {
    return parseStoredCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as unknown);
  } catch {
    return [];
  }
}

function idempotencyKey(): string {
  const current = sessionStorage.getItem(IDEMPOTENCY_KEY);
  if (current) return current;
  const created = crypto.randomUUID();
  sessionStorage.setItem(IDEMPOTENCY_KEY, created);
  return created;
}

export default function Checkout() {
  const [siteKey, setSiteKey] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [failed, setFailed] = useState("");
  const [sending, setSending] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        return (await response.json()) as CatalogResponse;
      })
      .then((data) => {
        const products = [...data.categories.agua, ...data.categories.gas];
        setCatalog(data);
        setCart(reconcileCart(readCart(), products));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed("Não foi possível carregar os produtos.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data: { turnstileSiteKey?: string } | null) => {
        if (data?.turnstileSiteKey) setSiteKey(data.turnstileSiteKey);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!siteKey || !widget.current) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (!widget.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: siteKey,
        action: "order",
      });
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [catalog, siteKey]);

  const products = catalog ? [...catalog.categories.agua, ...catalog.categories.gas] : [];
  const total = calculateDisplayTotal(cart, products);

  async function submit(form: FormData) {
    if (sending || cart.length === 0) return;
    const token = widgetId.current ? window.turnstile?.getResponse(widgetId.current) : "";
    if (!token) {
      setFailed("Confirme a verificação antes de enviar.");
      return;
    }
    setSending(true);
    setFailed("");
    const payload = {
      items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      customer: {
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
      },
      address: {
        street: String(form.get("street") ?? ""),
        number: String(form.get("number") ?? ""),
        neighborhood: String(form.get("neighborhood") ?? ""),
        complement: String(form.get("complement") ?? ""),
        reference: String(form.get("reference") ?? ""),
        city: String(form.get("city") ?? ""),
      },
      notes: String(form.get("notes") ?? ""),
      paymentMethod,
      turnstileToken: token,
      idempotencyKey: idempotencyKey(),
    };
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
        setFailed("Não foi possível registrar o pedido.");
        setSending(false);
        return;
      }
      const order = (await response.json()) as OrderConfirmation;
      sessionStorage.setItem(`gaspampulha.order.${order.publicCode}`, JSON.stringify(order));
      sessionStorage.removeItem(IDEMPOTENCY_KEY);
      localStorage.setItem(CART_KEY, "[]");
      window.location.assign(`/pedido/${order.publicCode}`);
    } catch {
      setFailed("Não foi possível registrar o pedido.");
      setSending(false);
    }
  }

  return (
    <>
    <SiteHeader name={catalog?.store.name} />
    <main className="page">
      <p className="mark">Pedido</p>
      <h1>Seus dados</h1>
      {failed ? <p className="error-text">{failed}</p> : null}
      <section className="cart">
        <h2>Resumo</h2>
        {catalog && cart.length === 0 ? (
          <p className="muted">
            Seu carrinho está vazio. <a href="/#gas">Escolher produtos</a>
          </p>
        ) : null}
        {cart.map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) return null;
          return (
            <p key={item.productId}>
              {product.name} · {item.quantity} · {formatBrl(product.price_cents * item.quantity)}
            </p>
          );
        })}
        <p className="total">Total {formatBrl(total)}</p>
        {cart.length > 0 ? (
          <a className="edit" href="/loja#carrinho">
            Alterar itens
          </a>
        ) : null}
      </section>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}
      >
        <label>
          Nome
          <input name="name" required maxLength={80} autoComplete="name" />
        </label>
        <label>
          Telefone
          <input name="phone" required inputMode="tel" autoComplete="tel" maxLength={20} />
        </label>
        <label>
          Rua
          <input name="street" required maxLength={120} />
        </label>
        <label>
          Número
          <input name="number" required maxLength={20} />
        </label>
        <label>
          Bairro
          <input name="neighborhood" required maxLength={80} />
        </label>
        <label>
          Complemento
          <input name="complement" maxLength={80} />
        </label>
        <label>
          Referência
          <input name="reference" maxLength={120} />
        </label>
        <label>
          Cidade
          <input name="city" required maxLength={80} />
        </label>
        <label>
          Observação
          <textarea name="notes" maxLength={300} rows={3} />
        </label>
        <fieldset>
          <legend>Forma de pagamento</legend>
          <label>
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "pix"}
              onChange={() => setPaymentMethod("pix")}
            />
            PIX
          </label>
          <label>
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "dinheiro"}
              onChange={() => setPaymentMethod("dinheiro")}
            />
            Dinheiro
          </label>
          <label>
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "cartao"}
              onChange={() => setPaymentMethod("cartao")}
            />
            Cartão
          </label>
        </fieldset>
        <div ref={widget} />
        <button className="continue" type="submit" disabled={sending || cart.length === 0 || !siteKey}>
          {sending ? "Enviando..." : "Fazer pedido"}
        </button>
      </form>
    </main>
    </>
  );
}
