# PROJECT

Gaspampulha. MVP single-tenant de pedidos para um comércio local de água e gás. Um comércio, uma aplicação, um banco D1. O cliente pede sem conta. O admin opera o painel. O entregador abre o WhatsApp Web. PIX sem gateway.

# CURRENT STATE

Preview remoto ativo em `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev`. O binding D1 do preview aponta para `gaspampulha-preview` (`6fb672ad-dae3-424c-b01f-b287b1ea2aa5`). A conta tem só esse banco. Produção continua com id placeholder e não foi criada. Não houve deploy de produção.

# CURRENT PHASE

Release Gate.

# COMPLETED

- Preview Validation.
- Security Negative Path.
- Preview isolation.
- Turnstile positive and negative validation.
- Git hygiene. `.cursor/` fora do Git.
- Loja, pedido, painel, produtos, entrega e auditoria.

# IN PROGRESS

Nada.

# NEXT ACTION

Criar o primeiro commit do release candidate e depois preparar o deploy de produção.

# ARCHITECTURE

- Local: `wrangler dev` e D1 `gaspampulha`.
- Preview: o mesmo Worker `gaspampulha`, bloco `previews`, banco `gaspampulha-preview`.
- Produção: Worker `gaspampulha`, id ainda `00000000-0000-0000-0000-000000000000`.
- Segredos de preview foram enviados com `--secrets-file` temporário, apagado em seguida. `base-config secret put` falha enquanto o script de produção não existe.
- `TURNSTILE_SITEKEY` é var pública. Local e preview usam a sitekey de teste. Produção não.

# CONSTRAINTS

Plano gratuito do Cloudflare. Sem VPS, Docker, Postgres, Redis, Supabase, Firebase, n8n, WhatsApp Business API, gateway ou IA no runtime. Sem apagar banco remoto. Sem DNS nesta fase.

# SECURITY INVARIANTS

- Senha e segredo não entram no git, no bundle como valor, no log, no audit nem neste arquivo.
- Admin, pedido autenticado e auditoria respondem `Cache-Control: no-store`.
- Erro ao cliente é `request_failed` mais `request_id`, sem stack.
- Preview não pode reutilizar o `database_id` de produção.
- `npm run deploy` e `npm run deploy:preview` param se o id ainda for placeholder.

# DECISIONS

Ver `docs/decisions.md` e `docs/release.md`. Amostragem de log 1 para não perder incidente numa loja só. Hash de senha permanece em 10.000 iterações.

# KNOWN RISKS

- O id de produção ainda é placeholder. A guarda recusa deploy enquanto a sitekey for a de teste.
- A secret de teste do Turnstile aceita qualquer token. Um 403 de token inválido só aparece com a secret real.
- 20.000 iterações passaram de 10 ms numa medição e couberam em outra. O código fica em 10.000.
- Workers Logs em amostragem 1 pode bater o teto do plano gratuito.
- Sessões, CSRF e tentativas de login crescem sem job de limpeza.

# KNOWN ISSUES

- O build avisa depreciação de `punycode`, vindo do Wrangler.
- O script `admin:create` grava só no D1 local.
- O Node 22 desta máquina não executa TypeScript nativo.

# VALIDATION

2026-09-24. Preview validado, inclusive o 403 com a secret always-fail e a volta da secret always-pass. `npm test` 39/39. Build e `verify:assets` ok. Produção não existe. Sem push.

# LAST CHANGE

Fase 8. Release gate local. A guarda de produção recusa placeholder, sitekey de teste e secret em `vars`. `docs/release.md` descreve local, preview, produção e rollback do preview.

# HANDOFF

URL: `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev`. Banco: `gaspampulha-preview`, id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Produção: id `00000000-0000-0000-0000-000000000000`, banco inexistente.

Turnstile: local e preview usam sitekey de teste e, no uso normal, secret always-pass. A secret always-fail só entra num deployment temporário de teste negativo. Produção ainda não tem sitekey nem secret reais.

Observabilidade: painel do preview `gaspampulha-rc`. Não usar `wrangler tail`. A API de telemetry desta conta respondeu 10000, então o JSON do log não foi lido por aqui.

Correlação do pedido restaurado `SHPW6LJD`: `request_id` `81295a6d-63db-4a3b-bc53-baace771b67b` em `audit_events`. Rejeição do pedido: `c67ae42d-eaea-4ea6-acb1-d742d1fee7bf`. Rejeição do login: `9c6b1b98-e332-491d-b909-e2ce42198446`.

Testes: `npm test` 39/39. `npm run build` e `verify:assets` ok.

Riscos: secret always-pass não rejeita token; sitekey de teste ainda está no config de produção e a guarda impede o deploy; limpeza de sessão continua manual.

Pendências de produção: criar o D1 real, trocar o placeholder, sitekey e secrets reais, admin nesse banco, conferir cota de Workers Logs, DNS só depois. O JSON `ORDER_CREATE_TURNSTILE_REJECTED` ainda não foi lido no painel do preview. Sem push e sem deploy.
