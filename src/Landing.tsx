import { useEffect, useState, type PointerEvent } from "react";

type StoreContact = { name: string; whatsapp: string };
type FromPrices = { agua: number | null; gas: number | null };

function lowestCents(products: Array<{ price_cents?: number }>): number | null {
  const cents = products
    .map((product) => product.price_cents)
    .filter((price): price is number => Number.isInteger(price) && price >= 0);
  if (cents.length === 0) return null;
  return Math.min(...cents);
}

function reais(cents: number): string {
  const whole = Math.trunc(cents / 100).toLocaleString("pt-BR");
  const frac = String(Math.abs(cents % 100)).padStart(2, "0");
  return `R$ ${whole},${frac}`;
}

export default function Landing() {
  const [store, setStore] = useState<StoreContact | null>(null);
  const [fromPrices, setFromPrices] = useState<FromPrices | null>(null);

  useEffect(() => {
    const existing = document.querySelector("link[data-gasp-font='archivo']");
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&display=swap";
    link.dataset.gaspFont = "archivo";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data: { store?: { name?: string; whatsapp?: string }; categories?: { agua?: Array<{ price_cents?: number }>; gas?: Array<{ price_cents?: number }> } } | null) => {
        if (!data) return;
        if (data.store?.name) setStore({ name: data.store.name, whatsapp: data.store.whatsapp ?? "" });
        if (!data.categories) return;
        setFromPrices({
          agua: lowestCents(data.categories.agua ?? []),
          gas: lowestCents(data.categories.gas ?? []),
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function ripple(event: PointerEvent<HTMLAnchorElement>, kind: "water" | "flame") {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    const mark = document.createElement("span");
    mark.className = kind === "water" ? "drop" : "flame";
    mark.style.left = `${event.clientX - rect.left}px`;
    mark.style.top = `${event.clientY - rect.top}px`;
    host.appendChild(mark);
    mark.addEventListener("animationend", () => mark.remove(), { once: true });
  }

  const digits = (store?.whatsapp ?? "").replace(/\D/g, "");

  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">Gaspampulha</p>
        <h1>Água e gás entregues na sua casa</h1>
        <p className="lead">Peça o galão ou o botijão. O pagamento é no Pix ou em dinheiro.</p>
        <a className="cta" href="#seletores">
          Ver água e gás
        </a>
        <svg className="shore" viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <path d="M0 72C180 112 320 8 520 28C760 52 860 118 1100 86C1260 64 1360 20 1440 36V120H0Z" />
        </svg>
      </section>
      <section className="sheet" id="seletores">
        <div className="choices">
          <a className="choice water" href="/#agua" onPointerDown={(event) => ripple(event, "water")}>
            <span>Água</span>
            {fromPrices ? <small>{fromPrices.agua === null ? "em breve" : `a partir de ${reais(fromPrices.agua)}`}</small> : null}
            <small>Galões para a casa</small>
          </a>
          <a className="choice gas" href="/#gas" onPointerDown={(event) => ripple(event, "flame")}>
            <span>Gás</span>
            {fromPrices ? <small>{fromPrices.gas === null ? "em breve" : `a partir de ${reais(fromPrices.gas)}`}</small> : null}
            <small>Botijão para a cozinha</small>
          </a>
        </div>
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
        <p className="facts">Pagamento no Pix ou em dinheiro. A área e o horário entram no pedido.</p>
        <footer>
          <p>{store?.name ?? "Gaspampulha"}</p>
          {digits ? <a href={`tel:+${digits}`}>Ligar para a loja</a> : <a href="/">Ir para a loja</a>}
        </footer>
      </section>
    </div>
  );
}
