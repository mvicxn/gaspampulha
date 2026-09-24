import type { OrderConfirmation } from "../shared/types.ts";
import { formatBrl } from "./cart.ts";

const LABELS = { pix: "PIX", dinheiro: "Dinheiro", cartao: "Cartão" } as const;

export default function Confirmation({ code }: { code: string }) {
  const raw = sessionStorage.getItem(`gaspampulha.order.${code}`);
  const order = raw ? (JSON.parse(raw) as OrderConfirmation) : null;
  return (
    <main>
      <p className="mark">Pedido realizado</p>
      <h1>Código {code}</h1>
      {order ? (
        <section className="cart">
          {order.items.map((item) => (
            <p key={item.productId}>
              {item.productName} · {item.quantity} · {formatBrl(item.unitPriceCents * item.quantity)}
            </p>
          ))}
          <p className="total">Total {formatBrl(order.totalCents)}</p>
          <p>Pagamento: {LABELS[order.paymentMethod]}</p>
        </section>
      ) : (
        <p className="muted">O resumo deste pedido está neste aparelho somente logo após o envio.</p>
      )}
      <a className="continue link" href="/">
        Voltar à loja
      </a>
    </main>
  );
}
