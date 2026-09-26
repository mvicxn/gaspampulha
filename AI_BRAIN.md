# PROJECT

Gaspampulha. Um comércio, uma aplicação, um banco D1. Cliente pede sem conta. Admin opera o painel. Entrega por WhatsApp Web. PIX sem gateway.

# CURRENT STATE

Atualizado em 2026-09-26, a partir do Git, do deployment ativo e do D1 de produção.

Produção publicada em https://gaspampulha.magi-tools.workers.dev. Versão `d72e0e63-1471-451f-9f1a-d989ccfa8012` com 100% do tráfego, criada em 2026-09-26T21:23:42Z. Os secrets `TURNSTILE_SECRET` e `AUDIT_HASH_SALT` são os que já estavam no Worker.

Rotas: `/` é a landing (produtos do catálogo com quantidade e "Pedir" direto para o checkout, como funciona, segurança, área, contato). `/inicio` abre a mesma página. `/loja` é a loja com carrinho. `/checkout`, `/pedido/:code` e `/admin/*` sem mudança de fluxo.

D1 `gaspampulha-production` (`793f344d-b581-4d59-a46a-4e8525903180`): migrations `0001` a `0007`, 4 produtos, 1 admin, 0 pedidos. `service_area` e `opening_hours` existem e estão vazios. `whatsapp_number` ainda é o número de exemplo do seed, e o catálogo público o devolve vazio.

Validado no ar: `/`, `/inicio`, `/loja`, `/checkout`, `/admin/login` e `/api/health` com 200. Catálogo real, landing em 320 px sem rolagem lateral, pedido da landing chegando ao checkout com o Turnstile real. POST de pedido com token falso responde 403 e não grava. Nenhum pedido de produção foi criado.

Git em `main`. Repositório público: https://github.com/mvicxn/gaspampulha.

# CURRENT PHASE

Produção publicada com a nova home. Faltam os dados reais da loja.

# NEXT ACTION

Entrar em `/admin/settings` e preencher WhatsApp real da loja, área de atendimento, horário, WhatsApp do entregador e chave PIX. A senha do admin `operador` não está nesta máquina; recuperá-la antes, sem criar outro admin.

# CONSTRAINTS

Plano gratuito do Cloudflare. Sem VPS, Docker, Postgres, Redis, Supabase, Firebase, n8n, WhatsApp Business API, gateway ou IA no runtime. Sem apagar D1 para rollback. Deploy: `GASP_KEEP_REMOTE_SECRETS=1 npm run predeploy` e depois `npm run deploy` com `GASP_CONFIRM_DEPLOY`, conforme `docs/release.md`.

# SECURITY INVARIANTS

Senha e segredo não entram no Git, no bundle como valor, no log, no audit nem neste arquivo. Preview e produção usam bancos diferentes. `preview_urls` permanece `false`. O deploy de produção não usa Version URL.

# DECISIONS

O histórico está em `docs/decisions.md`.

# KNOWN RISKS

Sem WhatsApp real, o site não oferece contato direto, só o pedido. Número do entregador e chave PIX vazios. O smoke autenticado do admin em produção continua pendente pela senha.

# KNOWN ISSUES

O `punycode` deprecado vem do Wrangler. O Node desta máquina não executa TypeScript nativo. Os testes compilam antes de rodar.
