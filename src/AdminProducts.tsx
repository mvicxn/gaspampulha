import { useEffect, useState } from "react";
import { formatBrl } from "./cart.ts";
import AdminNav from "./AdminNav.tsx";

interface ProductRow {
  id: number;
  name: string;
  category: "agua" | "gas";
  priceCents: number;
  active: boolean;
  sortOrder: number;
  version: number;
}

export default function AdminProducts() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [csrf, setCsrf] = useState(sessionStorage.getItem("gaspampulha.csrf") ?? "");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<ProductRow | null>(null);

  async function load() {
    const response = await fetch("/api/admin/products");
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      setMessage("Não foi possível carregar os produtos.");
      return;
    }
    const data = (await response.json()) as { products: ProductRow[] };
    setProducts(data.products);
  }

  useEffect(() => {
    void load();
  }, []);

  async function send(path: string, method: "POST" | "PATCH", body: unknown) {
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json", "x-csrf-token": csrf, origin: window.location.origin },
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (response.status === 409) {
      setMessage("Este produto foi alterado por outra sessão. Recarregue antes de salvar.");
      await load();
      return;
    }
    if (!response.ok) {
      setMessage("Não foi possível salvar o produto.");
      return;
    }
    const data = (await response.json()) as { csrfToken: string };
    sessionStorage.setItem("gaspampulha.csrf", data.csrfToken);
    setCsrf(data.csrfToken);
    setEditing(null);
    setMessage("Produto salvo.");
    await load();
  }

  return (
    <main className="admin">
      <AdminNav />
      <h1>Produtos</h1>
      {message ? <p>{message}</p> : null}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const reais = String(form.get("price") ?? "").replace(",", ".");
          const cents = Math.round(Number(reais) * 100);
          void send("/api/admin/products", "POST", {
            name: String(form.get("name") ?? ""),
            category: String(form.get("category") ?? ""),
            price_cents: cents,
            sort_order: Number(form.get("sort") ?? 0),
          });
          event.currentTarget.reset();
        }}
      >
        <h2>Novo produto</h2>
        <label>
          Nome
          <input name="name" required />
        </label>
        <label>
          Categoria
          <select name="category" defaultValue="agua">
            <option value="agua">Água</option>
            <option value="gas">Gás</option>
          </select>
        </label>
        <label>
          Preço em reais
          <input name="price" inputMode="decimal" required placeholder="18,00" />
        </label>
        <label>
          Ordem
          <input name="sort" type="number" min={0} max={999} defaultValue={0} required />
        </label>
        <button className="continue" type="submit">
          Criar
        </button>
      </form>
      <div className="order-list">
        {products.map((product) => (
          <article key={product.id} className="order-card">
            <p className="code">{product.name}</p>
            <p>{product.category === "agua" ? "Água" : "Gás"}</p>
            <p>{formatBrl(product.priceCents)}</p>
            <p>{product.active ? "Ativo" : "Inativo"} · ordem {product.sortOrder}</p>
            <div className="actions">
              <button type="button" onClick={() => setEditing(product)}>
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (product.active && !window.confirm("Desativar este produto?")) return;
                  void send(`/api/admin/products/${product.id}`, "PATCH", {
                    active: !product.active,
                    version: product.version,
                  });
                }}
              >
                {product.active ? "Desativar" : "Ativar"}
              </button>
            </div>
            {editing?.id === product.id ? (
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const reais = String(form.get("price") ?? "").replace(",", ".");
                  void send(`/api/admin/products/${product.id}`, "PATCH", {
                    name: String(form.get("name") ?? ""),
                    category: String(form.get("category") ?? ""),
                    price_cents: Math.round(Number(reais) * 100),
                    sort_order: Number(form.get("sort") ?? 0),
                    version: product.version,
                  });
                }}
              >
                <input name="name" defaultValue={product.name} required />
                <select name="category" defaultValue={product.category}>
                  <option value="agua">Água</option>
                  <option value="gas">Gás</option>
                </select>
                <input name="price" defaultValue={(product.priceCents / 100).toFixed(2).replace(".", ",")} required />
                <input name="sort" type="number" defaultValue={product.sortOrder} required />
                <button type="submit">Salvar alterações</button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </main>
  );
}
