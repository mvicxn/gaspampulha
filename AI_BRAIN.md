# PROJECT

Gaspampulha. Um comércio, uma aplicação, um banco D1. Cliente pede sem conta. Admin opera o painel. Entrega por WhatsApp Web. PIX sem gateway.

# CURRENT STATE

Atualizado em 2026-09-26. Repaginação commitada, ainda não publicada.

`/` é a landing com produtos e pedido direto. A loja está em `/loja`. Migration `0007` (área e horário) existe no repo e ainda não foi aplicada em produção. Em produção, `whatsapp_number` ainda é o número de exemplo do seed. O catálogo novo esconde esse número.

Produção no último registro: versão `5b27e68e-f57d-463b-8742-59bf67ff7c64`. D1 `gaspampulha-production` (`793f344d-b581-4d59-a46a-4e8525903180`): 4 produtos, 1 admin, 0 pedidos.

# CURRENT PHASE

Release da repaginação.

# NEXT ACTION

Aplicar `0007` em produção, publicar com `GASP_KEEP_REMOTE_SECRETS=1` e validar o site publicado.

# CONSTRAINTS

Plano gratuito do Cloudflare. Sem VPS, Docker, Postgres, Redis, Supabase, Firebase, n8n, WhatsApp Business API, gateway ou IA no runtime. Sem apagar D1 para rollback.

# SECURITY INVARIANTS

Senha e segredo não entram no Git, no bundle como valor, no log, no audit nem neste arquivo. Preview e produção usam bancos diferentes. `preview_urls` permanece `false`. O deploy de produção não usa Version URL.

# DECISIONS

O histórico está em `docs/decisions.md`.

# KNOWN RISKS

WhatsApp da loja, número do entregador, chave PIX, área e horário de produção não estão preenchidos com dados reais. A senha do admin de produção não está disponível nesta máquina.

# KNOWN ISSUES

O `punycode` deprecado vem do Wrangler. O Node desta máquina não executa TypeScript nativo. Os testes compilam antes de rodar.
