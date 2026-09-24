import { useEffect, useState } from "react";
import AdminNav from "./AdminNav.tsx";

interface AuditEvent {
  id: number;
  occurredAt: string;
  actorType: string;
  actorId: number | null;
  action: string;
  outcome: string;
  resourceType: string | null;
  resourceId: string | null;
  requestId: string | null;
  metadata: unknown;
}

export default function AdminAudit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [action, setAction] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  async function load(nextAction = action) {
    const params = new URLSearchParams();
    if (nextAction) params.set("action", nextAction);
    const response = await fetch(`/api/admin/audit?${params.toString()}`);
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { request_id?: string };
      setMessage(`Não foi possível carregar a auditoria. Código de atendimento: ${data.request_id ?? ""}`);
      return;
    }
    const data = (await response.json()) as { events: AuditEvent[] };
    setEvents(data.events);
    setMessage("");
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="admin">
      <AdminNav />
      <h1>Auditoria</h1>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Filtrar ação"
          value={action}
          placeholder="ORDER_CREATED"
          onChange={(event) => setAction(event.target.value)}
        />
        <button type="submit">Filtrar</button>
        <button type="button" onClick={() => void load()}>
          Atualizar
        </button>
      </form>
      {message ? <p className="error-text">{message}</p> : null}
      {events.length === 0 ? <p className="muted">Nenhum evento nesta consulta.</p> : null}
      <div className="order-list">
        {events.map((event) => (
          <article key={event.id} className="order-card">
            <p>{new Date(event.occurredAt).toLocaleString("pt-BR")}</p>
            <p>
              {event.action} · {event.outcome}
            </p>
            <p>
              {event.actorType}
              {event.actorId ? ` #${event.actorId}` : ""} · {event.resourceType} {event.resourceId}
            </p>
            <p>{event.requestId}</p>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  if (!event.requestId) return;
                  void navigator.clipboard.writeText(event.requestId);
                  setCopied(event.requestId);
                }}
              >
                Copiar request id
              </button>
              <button type="button" onClick={() => setOpenId(openId === event.id ? null : event.id)}>
                {openId === event.id ? "Fechar" : "Ver metadata"}
              </button>
            </div>
            {copied === event.requestId ? <p className="muted">Request id copiado.</p> : null}
            {openId === event.id ? <pre className="meta">{JSON.stringify(event.metadata, null, 2)}</pre> : null}
          </article>
        ))}
      </div>
    </main>
  );
}
