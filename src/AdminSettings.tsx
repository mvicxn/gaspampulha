import { useEffect, useState } from "react";
import AdminNav from "./AdminNav.tsx";

interface SettingsForm {
  storeName: string;
  whatsappNumber: string;
  pixKey: string;
  deliveryWhatsappNumber: string;
  versions: { store_name: number; whatsapp_number: number; pix_key: number; delivery_whatsapp_number: number };
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
        <button className="continue" type="submit">
          Salvar alterações
        </button>
      </form>
    </main>
  );
}
