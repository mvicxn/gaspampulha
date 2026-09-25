import { useEffect, useState, type PointerEvent } from "react";

type StoreContact = { name: string; whatsapp: string };

export default function Landing() {
  const [store, setStore] = useState<StoreContact | null>(null);

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
      .then((data: { store?: { name?: string; whatsapp?: string } } | null) => {
        if (!data?.store?.name) return;
        setStore({ name: data.store.name, whatsapp: data.store.whatsapp ?? "" });
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
            <small>Galões para a casa</small>
          </a>
          <a className="choice gas" href="/#gas" onPointerDown={(event) => ripple(event, "flame")}>
            <span>Gás</span>
            <small>Botijão para a cozinha</small>
          </a>
        </div>
        <p className="facts">Pagamento no Pix ou em dinheiro. A área e o horário entram no pedido.</p>
        <footer>
          <p>{store?.name ?? "Gaspampulha"}</p>
          {digits ? <a href={`tel:+${digits}`}>Ligar para a loja</a> : <a href="/">Ir para a loja</a>}
        </footer>
      </section>
    </div>
  );
}
