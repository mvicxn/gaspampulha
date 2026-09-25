# PROJECT

Gaspampulha. MVP single-tenant de pedidos para um comércio local de água e gás. Um comércio, uma aplicação, um banco D1. O cliente pede sem conta. O admin opera o painel. O entregador abre o WhatsApp Web. PIX sem gateway.

# CURRENT STATE

Preview remoto ativo em `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev`, D1 `gaspampulha-preview` (`6fb672ad-dae3-424c-b01f-b287b1ea2aa5`). Produção tem D1 `gaspampulha-production` (`793f344d-b581-4d59-a46a-4e8525903180`) e ainda não foi publicada.

# CURRENT PHASE

Production Final Gate — READY TO DEPLOY.

# COMPLETED

- Security incident closed.
- Production D1 ready.
- Production Turnstile ready.
- Production secrets ready.
- First admin created.
- Production catalog bootstrap.
- Release commit.
- Predeploy gate.

# IN PROGRESS

Nada.

# NEXT ACTION

Deploy controlado de produção após confirmação humana.

# ARCHITECTURE

- Local: `wrangler dev` e D1 `gaspampulha`.
- Preview: o mesmo Worker `gaspampulha`, bloco `previews`, banco `gaspampulha-preview`.
- Produção: Worker `gaspampulha`, D1 `gaspampulha-production`, id `793f344d-b581-4d59-a46a-4e8525903180`.
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

- A guarda recusa deploy enquanto a sitekey e a secret forem as de teste.
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

Catálogo inicial aplicado só no D1 de produção. Arquivo temporário da senha do admin apagado. Sem deploy.

# HANDOFF

URL: `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev`. Banco de preview: `gaspampulha-preview`, id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Produção: `gaspampulha-production`, id `793f344d-b581-4d59-a46a-4e8525903180`.

Hostname previsto: `gaspampulha.magi-tools.workers.dev`. `workers_dev` true e `preview_urls` false no config. O remoto ainda está com o subdomínio desligado até o deploy. Secrets em `/tmp/gaspampulha-production-secrets.env`. A senha do admin `operador` está só em `/tmp/gaspampulha-production-admin.env`. Deploy ainda não rodou: `npx wrangler deploy --secrets-file /tmp/gaspampulha-production-secrets.env`, com `GASP_CONFIRM_DEPLOY` igual ao id do D1. Smoke test depois: health, catálogo, um pedido, login, status e logout. Rollback é não repetir o deploy e voltar o subdomínio se precisar.

Observabilidade: painel do preview `gaspampulha-rc`. Não usar `wrangler tail`. A API de telemetry desta conta respondeu 10000, então o JSON do log não foi lido por aqui.

Correlação do pedido restaurado `SHPW6LJD`: `request_id` `81295a6d-63db-4a3b-bc53-baace771b67b` em `audit_events`. Rejeição do pedido: `c67ae42d-eaea-4ea6-acb1-d742d1fee7bf`. Rejeição do login: `9c6b1b98-e332-491d-b909-e2ce42198446`.

Testes: `npm test` 39/39. `npm run build` e `verify:assets` ok.

Riscos: secret always-pass não rejeita token; sitekey de teste ainda está no config de produção e a guarda impede o deploy; limpeza de sessão continua manual.

Commits: `ffb592ed7bc5ed0c90259a40ccaefd2491f7244c`, `4b75e48beba318f3193cb8cf49338ae184d965bb`, e o desta fase `chore: bind production database`. Preview: `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev`, D1 `gaspampulha-preview` `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Produção: `gaspampulha-production` `793f344d-b581-4d59-a46a-4e8525903180`. Migrations `0001`–`0006` aplicadas. Pedidos, auditoria e admin estão em zero. A próxima carga é o seed, ainda não executada. Sem Turnstile, secret, admin, DNS ou deploy.

Secrets de produção, ainda ausentes: `TURNSTILE_SECRET` e `AUDIT_HASH_SALT`, exclusivos, fora do Git. Turnstile de produção: widget, hostname, sitekey e secret reais. Migrations `0001`–`0006` não se editam. O gate está em `docs/production.md`.

Version URLs desligadas. Preview segue em `https://gaspampulha-rc-gaspampulha.magi-tools.workers.dev` com o D1 `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Produção `793f344d-b581-4d59-a46a-4e8525903180` ainda sem deployment, sem Turnstile e sem secrets. Hostname de produção do script ainda não registrado. Sem commit.
