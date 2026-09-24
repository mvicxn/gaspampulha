import { useEffect, useRef, useState } from "react";

export default function AdminLogin() {
  const [siteKey, setSiteKey] = useState("");
  const [failed, setFailed] = useState("");
  const [sending, setSending] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

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
      widgetId.current = window.turnstile.render(widget.current, { sitekey: siteKey, action: "admin-login" });
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [siteKey]);

  return (
    <main>
      <h1>Painel</h1>
      {failed ? <p className="error-text">{failed}</p> : null}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const token = widgetId.current ? window.turnstile?.getResponse(widgetId.current) : "";
          if (!token) {
            setFailed("Não foi possível entrar.");
            return;
          }
          setSending(true);
          void fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: String(form.get("username") ?? ""),
              password: String(form.get("password") ?? ""),
              turnstileToken: token,
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                if (widgetId.current) window.turnstile?.reset(widgetId.current);
                setFailed("Não foi possível entrar.");
                setSending(false);
                return;
              }
              const data = (await response.json()) as { csrfToken: string };
              sessionStorage.setItem("gaspampulha.csrf", data.csrfToken);
              window.location.assign("/admin");
            })
            .catch(() => {
              setFailed("Não foi possível entrar.");
              setSending(false);
            });
        }}
      >
        <label>
          Usuário
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <div ref={widget} />
        <button className="continue" type="submit" disabled={sending || !siteKey}>
          {sending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
