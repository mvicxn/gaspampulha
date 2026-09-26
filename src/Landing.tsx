import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CatalogResponse, ProductCategory, PublicProduct } from "../shared/types.ts";
import { addItem, CART_KEY, CART_MAX, CART_MIN, formatBrl, parseStoredCart, type CartItem } from "./cart.ts";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; catalog: CatalogResponse };

const CATEGORY = {
  gas: { title: "Gás", hint: "Botijão para a cozinha", mark: "flame" },
  agua: { title: "Água", hint: "Galões para a casa", mark: "drop" },
} as const;

function contactLink(whatsapp: string): string | null {
  const digits = whatsapp.replace(/\D/g, "");
  if (!/^\d{10,13}$/.test(digits)) return null;
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent("Oi, vim do site")}`;
}

function lowest(products: PublicProduct[]): number | null {
  if (products.length === 0) return null;
  return Math.min(...products.map((product) => product.price_cents));
}

function orderNow(productId: number, quantity: number) {
  let current: CartItem[];
  try {
    current = parseStoredCart(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as unknown);
  } catch {
    current = [];
  }
  localStorage.setItem(CART_KEY, JSON.stringify(addItem(current, productId, quantity)));
  window.location.assign("/checkout");
}

function burst(event: PointerEvent<HTMLElement>, mark: "drop" | "flame") {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const host = event.currentTarget;
  const rect = host.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = mark;
  dot.style.left = `${event.clientX - rect.left}px`;
  dot.style.top = `${event.clientY - rect.top}px`;
  host.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove(), { once: true });
}

function ProductRow({ product, mark }: { product: PublicProduct; mark: "drop" | "flame" }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <li className="product">
      <div className="product-info">
        <h4>{product.name}</h4>
        <p className="product-price">{formatBrl(product.price_cents)}</p>
      </div>
      <div className="product-actions">
        <div className="stepper" role="group" aria-label={`Quantidade de ${product.name}`}>
          <button type="button" aria-label="Diminuir" onClick={() => setQuantity((value) => Math.max(CART_MIN, value - 1))}>
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" aria-label="Aumentar" onClick={() => setQuantity((value) => Math.min(CART_MAX, value + 1))}>
            +
          </button>
        </div>
        <button
          type="button"
          className={`order ${mark}-order`}
          onPointerDown={(event) => burst(event, mark)}
          onClick={() => orderNow(product.id, quantity)}
        >
          Pedir
        </button>
      </div>
    </li>
  );
}

function CategoryPanel({ category, load }: { category: ProductCategory; load: Load }) {
  const meta = CATEGORY[category];
  const products = load.state === "ready" ? load.catalog.categories[category] : [];
  const from = lowest(products);
  return (
    <section className={`panel ${category}`} id={category} aria-labelledby={`${category}-title`}>
      <header className="panel-head">
        <h3 id={`${category}-title`}>{meta.title}</h3>
        <p>{meta.hint}</p>
        {load.state === "ready" ? <p className="from">{from === null ? "Em breve" : `a partir de ${formatBrl(from)}`}</p> : null}
      </header>
      {load.state === "loading" ? <p className="panel-note">Carregando produtos…</p> : null}
      {load.state === "failed" ? (
        <p className="panel-note">
          Não foi possível carregar os produtos agora. <a href="/loja">Abrir a loja</a>
        </p>
      ) : null}
      {load.state === "ready" && products.length === 0 ? <p className="panel-note">Nenhum produto disponível no momento.</p> : null}
      {products.length > 0 ? (
        <ul className="products">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} mark={meta.mark} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function Landing() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [dock, setDock] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const products = useRef<HTMLElement>(null);
  const closing = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog");
        return (await response.json()) as CatalogResponse;
      })
      .then((catalog) => setLoad({ state: "ready", catalog }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoad({ state: "failed" });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const targets = [hero.current, products.current, closing.current].filter((node): node is HTMLElement => node !== null);
    if (targets.length === 0 || !("IntersectionObserver" in window)) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setDock(visible.size === 0);
    });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const store = load.state === "ready" ? load.catalog.store : null;
  const name = store?.name || "Gaspampulha";
  const contact = store ? contactLink(store.whatsapp) : null;

  return (
    <div className="landing">
      <section className="hero" ref={hero}>
        <p className="eyebrow">{name}</p>
        <h1>Gás e água entregues na sua casa</h1>
        <p className="lead">Escolha o botijão ou o galão, informe o endereço e pague no Pix, em dinheiro ou no cartão.</p>
        <div className="hero-actions">
          <a className="cta" href="#gas">
            Pedir gás agora
          </a>
          <a className="ghost" href="#agua">
            Ver água
          </a>
        </div>
        <svg className="shore" viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 72C180 112 320 8 520 28C760 52 860 118 1100 86C1260 64 1360 20 1440 36V120H0Z" />
        </svg>
      </section>

      <main className="sheet">
        <section className="block" aria-labelledby="vantagens">
          <h2 id="vantagens">Por que pedir aqui</h2>
          <ul className="points">
            <li>
              <h3>Sem cadastro</h3>
              <p>Nome, telefone e endereço bastam. Sem conta e sem senha.</p>
            </li>
            <li>
              <h3>Gás e água juntos</h3>
              <p>Botijão e galão no mesmo pedido, com o total na tela.</p>
            </li>
            <li>
              <h3>Pague como preferir</h3>
              <p>Pix, dinheiro ou cartão, escolhido ao fechar o pedido.</p>
            </li>
          </ul>
        </section>

        <section className="block" id="produtos" ref={products} aria-labelledby="produtos-title">
          <h2 id="produtos-title">Produtos</h2>
          <p className="block-lead">Escolha a quantidade e toque em Pedir. Você confere tudo antes de enviar.</p>
          <div className="panels">
            <CategoryPanel category="gas" load={load} />
            <CategoryPanel category="agua" load={load} />
          </div>
        </section>

        <section className="block" aria-labelledby="como">
          <h2 id="como">Como funciona</h2>
          <ol className="steps">
            <li>
              <span>1</span>
              Escolher o produto
            </li>
            <li>
              <span>2</span>
              Confirmar endereço e pagamento
            </li>
            <li>
              <span>3</span>
              Receber em casa
            </li>
          </ol>
        </section>

        <section className="block" aria-labelledby="confianca">
          <h2 id="confianca">Pedido com segurança</h2>
          <ul className="points">
            <li>
              <h3>Código do pedido</h3>
              <p>Ao enviar, você recebe um código que identifica o seu pedido.</p>
            </li>
            <li>
              <h3>Preço conferido</h3>
              <p>O total é calculado pela loja com o preço de tabela.</p>
            </li>
            <li>
              <h3>Verificação automática</h3>
              <p>Uma checagem barra pedidos enviados por robôs.</p>
            </li>
          </ul>
        </section>

        <section className="block split" aria-labelledby="area">
          <div>
            <h2 id="area">Onde atendemos</h2>
            <p>
              {store?.serviceArea ||
                "Informe rua, número, bairro e cidade no pedido. A loja confere se o endereço está na área de entrega."}
            </p>
            {store?.openingHours ? <p className="hours">Horário: {store.openingHours}</p> : null}
          </div>
          <div id="contato">
            <h2>Fale com a loja</h2>
            {contact ? (
              <>
                <p>Tire dúvidas antes de pedir.</p>
                <a className="whatsapp" href={contact} target="_blank" rel="noopener noreferrer">
                  Conversar no WhatsApp
                </a>
              </>
            ) : (
              <p>O pedido feito pelo site chega direto à loja.</p>
            )}
          </div>
        </section>
      </main>

      <section className="closing" ref={closing} aria-labelledby="fechamento">
        <h2 id="fechamento">Acabou o gás?</h2>
        <p>Peça pelo site em poucos toques.</p>
        <a className="cta" href="#gas">
          Pedir gás agora
        </a>
      </section>

      <footer className="site-footer">
        <p className="brand">{name}</p>
        <nav aria-label="Rodapé">
          <a href="#produtos">Produtos</a>
          <a href="/loja">Loja</a>
          {contact ? (
            <a href={contact} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          ) : null}
        </nav>
      </footer>

      <a className={dock ? "dock is-on" : "dock"} href="#gas" aria-hidden={!dock} tabIndex={dock ? 0 : -1}>
        Pedir gás agora
      </a>
    </div>
  );
}
