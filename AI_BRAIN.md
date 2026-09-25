# PROJECT

Gaspampulha. Um comércio, uma aplicação, um banco D1. Cliente pede sem conta. Admin opera o painel. Entrega por WhatsApp Web. PIX sem gateway.

# CURRENT STATE

Atualizado em 2026-09-25, a partir do Git, do deployment ativo e do D1 de produção.

Produção está publicada. O deployment ativo é a versão `5b27e68e-f57d-463b-8742-59bf67ff7c64`, com 100% do tráfego, criada em 2026-09-25T02:56:37Z. O registro do deployment é 2026-09-25T02:56:38Z.

No D1 `gaspampulha-production` (`793f344d-b581-4d59-a46a-4e8525903180`): 4 produtos, 1 admin, 0 pedidos. O catálogo inicial e o primeiro admin já estão em produção. O pedido de validação no ar ainda não foi feito.

O Git está em `main`, alinhado com `origin/main`. O último commit enviado é `04cec438bfc3f8a01fd5f8de582f0b5627586f85`. O repositório público é https://github.com/mvicxn/gaspampulha.

# CURRENT PHASE

Produção publicada. Falta o smoke autenticado.

# NEXT ACTION

Entrar no admin de produção e concluir o smoke: um pedido, status, pagamento, auditoria e logout. Não criar outro admin e não publicar de novo só para isso.

# CONSTRAINTS

Plano gratuito do Cloudflare. Sem VPS, Docker, Postgres, Redis, Supabase, Firebase, n8n, WhatsApp Business API, gateway ou IA no runtime. Sem apagar D1 para rollback.

# SECURITY INVARIANTS

Senha e segredo não entram no Git, no bundle como valor, no log, no audit nem neste arquivo. Preview e produção usam bancos diferentes. `preview_urls` permanece `false`. O deploy de produção não usa Version URL.

# DECISIONS

O histórico está em `docs/decisions.md`.

# KNOWN RISKS

O número de entrega e a chave PIX de produção podem continuar vazios. A senha do admin não está no Git. Workers Logs no plano gratuito tem teto diário e retenção curta.

# KNOWN ISSUES

O `punycode` deprecado vem do Wrangler. O Node desta máquina não executa TypeScript nativo. Os testes compilam antes de rodar.
