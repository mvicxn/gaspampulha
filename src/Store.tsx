import { useEffect, useState } from "react";
import type { CatalogResponse, PublicProduct } from "../shared/types.ts";
import {
  addItem,
  calculateDisplayTotal,
  CART_MAX,
  CART_MIN,
  decreaseItem,
  formatBrl,
  increaseItem,
  parseStoredCart,
  reconcileCart,
  removeItem,
  type CartItem,
} from "./cart.ts";

const CART_KEY = "gaspampulha.cart";

function readCart(): CartItem[] {
  try {
    return parseStoredCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as unknown);
  } catch {
    return [];
  }
}

function QtyControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(Math.max(CART_MIN, value - 1))} aria-label="Diminuir">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(CART_MAX, value + 1))} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: PublicProduct;
  onAdd: (productId: number, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  return (
    <article className="card">
      <h3>{product.name}</h3>
      <p className="price">{formatBrl(product.price_cents)}</p>
      <QtyControl value={quantity} onChange={setQuantity} />
      <button type="button" className="add" onClick={() => onAdd(product.id, quantity)}>
        Adicionar
      </button>
    </article>
  );
}

function Category({
  title,
  products,
  onAdd,
  id,
}: {
  title: string;
  products: PublicProduct[];
  onAdd: (productId: number, quantity: number) => void;
  id?: string;
}) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {products.length === 0 ? <p className="muted">Nenhum produto nesta categoria.</p> : null}
      <div className="grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

export default function Store() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cart, setCart] = useState<CartItem[]>(readCart);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        return (await response.json()) as CatalogResponse;
      })
      .then((data) => {
        setCatalog(data);
        setFailed(false);
        const products = [...data.categories.agua, ...data.categories.gas];
        setCart((current) => reconcileCart(current, products));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const products = catalog ? [...catalog.categories.agua, ...catalog.categories.gas] : [];
  const total = calculateDisplayTotal(cart, products);

  function add(productId: number, quantity: number) {
    setCart((current) => addItem(current, productId, quantity));
  }

  return (
    <>
      <header className="top">
        <p className="mark">Água e gás</p>
        <h1>{catalog?.store.name || "Loja"}</h1>
      </header>
      <main>
        {failed ? (
          <section className="error">
            <p>Não foi possível carregar os produtos.</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Tentar novamente
            </button>
          </section>
        ) : null}
        {catalog ? (
          <>
            <Category id="agua" title="Água" products={catalog.categories.agua} onAdd={add} />
            <Category id="gas" title="Gás" products={catalog.categories.gas} onAdd={add} />
          </>
        ) : null}
        <section className="cart" aria-label="Carrinho">
          <h2>Carrinho</h2>
          {cart.length === 0 ? <p className="muted">Nenhum item ainda.</p> : null}
          <ul>
            {cart.map((item) => {
              const product = products.find((entry) => entry.id === item.productId);
              if (!product) return null;
              const subtotal = product.price_cents * item.quantity;
              return (
                <li key={item.productId}>
                  <div>
                    <strong>{product.name}</strong>
                    <p>{formatBrl(subtotal)}</p>
                  </div>
                  <QtyControl
                    value={item.quantity}
                    onChange={(next) =>
                      setCart((current) => {
                        if (next > item.quantity) return increaseItem(current, item.productId);
                        if (next < item.quantity) return decreaseItem(current, item.productId);
                        return current;
                      })
                    }
                  />
                  <button type="button" onClick={() => setCart((current) => removeItem(current, item.productId))}>
                    Remover
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="total">Total {formatBrl(total)}</p>
          <button
            type="button"
            className="continue"
            disabled={cart.length === 0}
            onClick={() => {
              window.location.assign("/checkout");
            }}
          >
            Continuar
          </button>
        </section>
      </main>
    </>
  );
}
