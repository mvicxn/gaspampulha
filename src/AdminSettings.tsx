import { useEffect, useState } from "react";
import AdminNav from "./AdminNav.tsx";

interface SettingsForm {
  storeName: string;
  whatsappNumber: string;
  pixKey: string;
  deliveryWhatsappNumber: string;
  serviceArea: string;
  openingHours: string;
  versions: {
    store_name: number;
    whatsapp_number: number;
    pix_key: number;
    delivery_whatsapp_number: number;
    service_area: number;
    opening_hours: number;
  };
}

export default function AdminSettings() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [csrf, setCsrf] = useState(sessionStorage.getItem("gaspampulha.csrf") ?? "");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/settings");
    if (response.status === 401) {
      window.location.assign("/admin/login");
      return;
    }
    if (!response.ok) {
      setMessage("Não foi possível carregar as configurações.");
      return;
    }
    setForm((await response.json()) as SettingsForm);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!form) {
    return (
      <main>
        <AdminNav />
        <p>{message || "Carregando..."}</p>
      </main>
    );
  }

  return (
    <main className="admin">
      <AdminNav />
      <h1>Configurações</h1>
      {message ? <p>{message}</p> : null}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void fetch("/api/admin/settings", {
            method: "PUT",
            headers: { "content-type": "application/json", "x-csrf-token": csrf, origin: window.location.origin },
            body: JSON.stringify({
              store_name: form.storeName,
              whatsapp_number: form.whatsappNumber,
              pix_key: form.pixKey,
              delivery_whatsapp_number: form.deliveryWhatsappNumber,
              service_area: form.serviceArea,
              opening_hours: form.openingHours,
              versions: form.versions,
            }),
          }).then(async (response) => {
            if (response.status === 409) {
              setMessage("Esta configuração foi alterada por outra sessão. Recarregue antes de salvar.");
              await load();
              return;
            }
            if (!response.ok) {
              setMessage("Não foi possível salvar.");
              return;
            }
            const data = (await response.json()) as { csrfToken: string };
            sessionStorage.setItem("gaspampulha.csrf", data.csrfToken);
            setCsrf(data.csrfToken);
            setMessage("Alterações salvas.");
            await load();
          });
        }}
      >
        <label>
          Nome da loja
          <input value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} />
        </label>
        <label>
          WhatsApp
          <input
            value={form.whatsappNumber}
            onChange={(event) => setForm({ ...form, whatsappNumber: event.target.value })}
          />
        </label>
        <label>
          Chave PIX
          <input value={form.pixKey} onChange={(event) => setForm({ ...form, pixKey: event.target.value })} />
        </label>
        <label>
          WhatsApp do entregador
          <input
            value={form.deliveryWhatsappNumber}
            onChange={(event) => setForm({ ...form, deliveryWhatsappNumber: event.target.value })}
          />
        </label>
        <label>
          Área de atendimento (aparece no site)
          <input
            value={form.serviceArea}
            maxLength={160}
            placeholder="Ex.: bairros ou cidades atendidas"
            onChange={(event) => setForm({ ...form, serviceArea: event.target.value })}
          />
        </label>
        <label>
          Horário de atendimento (aparece no site)
          <input
            value={form.openingHours}
            maxLength={160}
            placeholder="Ex.: dias e horários de entrega"
            onChange={(event) => setForm({ ...form, openingHours: event.target.value })}
          />
        </label>
        <button className="continue" type="submit">
          Salvar alterações
        </button>
      </form>
    </main>
  );
}
