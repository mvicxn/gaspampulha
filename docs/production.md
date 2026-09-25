# Produção

O D1 `gaspampulha-production` existe. O id é `793f344d-b581-4d59-a46a-4e8525903180`, no binding `DB`. Não é o placeholder e não é o preview `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Não há DNS, widget, secret nem admin de produção. Não houve deploy.

O ambiente só é `local`, `preview` ou `production` quando o alvo é explícito. Ausência de preview não significa produção. `scripts/deployment-env.mjs` recusa banco cruzado, sitekey de teste em produção e secret de teste em produção.

## A. D1

O banco foi criado em ENAM. O binding de produção em `wrangler.jsonc` é `DB`, nome `gaspampulha-production`, id `793f344d-b581-4d59-a46a-4e8525903180`. O preview permanece no bloco `previews`.

## B. Migrations

Não editar `migrations/0001`–`0006`. O preview já aplicou esses arquivos. Uma mudança futura é um arquivo novo.

```bash
npx wrangler d1 migrations apply gaspampulha --local
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
npx wrangler d1 migrations apply gaspampulha-production --remote
```

As migrations `0001`–`0006` já foram aplicadas em `gaspampulha-production` (`793f344d-b581-4d59-a46a-4e8525903180`). `scripts/guard-remote.mjs production-migrate` não aplica migration e recusa `delete`, `drop` e `reset`. Não há flag que pule a guarda.

`migrations/0003_public_actor.sql` recria `audit_events` para aceitar o ator `public`. Isso já rodou no preview, quando a tabela ainda não era histórico de produção. Não há `DROP` de `orders`. O seed não tem senha nem pedido.

Local usa o SQLite do Wrangler. Preview usa só `gaspampulha-preview`. Produção, ainda inexistente, será `gaspampulha-production`. Nenhum script copia um banco para o outro.

## C. Turnstile

Widget separado, hostname restrito ao domínio real. Sitekey e secret reais. Não usar as chaves oficiais de teste, nem a que sempre passa nem a que sempre falha.

## D. Sitekey

Só a var pública `TURNSTILE_SITEKEY` no bloco de produção de `wrangler.jsonc`. O frontend lê `turnstileSiteKey` em `GET /api/health`. Hoje o valor é a sitekey de teste, e `npm run deploy` recusa isso.

## E. Secret do Turnstile

```bash
npx wrangler secret put TURNSTILE_SECRET
```

O Worker lê `TURNSTILE_SECRET`. Não inverter com a sitekey. Não gravar o valor.

## F. Salt

```bash
npx wrangler secret put AUDIT_HASH_SALT
```

Valor aleatório só da produção. Não reutilizar o salt local nem o de preview. Não gravar o valor.

## G. Admin

`npm run admin:create` grava no D1 local. Produção:

```bash
node scripts/create-admin.mjs production
```

Com `ADMIN_USERNAME` e `ADMIN_PASSWORD` só no ambiente do comando. Enquanto o id for placeholder, o script para antes do Wrangler. Não há senha no seed.

## H. Smoke test

Depois do deploy, na URL de produção: `GET /`, `GET /api/health`, `GET /api/catalog`, Turnstile, um pedido, login, ver o pedido, status, pagamento, auditoria, logout, headers de segurança e um `request_id` no log.

## I. Rollback

No painel, anotar o deployment e voltar para a versão estável anterior do Worker. Parar mudanças. Não apagar o D1. Não reverter schema com `DROP`. Se a migration nova for incompatível com o Worker antigo, corrigir para a frente com outro arquivo.

## J. Domínio

Depois, no painel: custom domain do Worker e o mesmo hostname no widget do Turnstile. Sem DNS nesta fase.

## Dados

Produção está sem pedidos, sem admin e sem auditoria. A migration `0006` inseriu só `delivery_whatsapp_number` vazio. A próxima carga de dados, ainda não executada, é `seed/seed.sql`: settings e produtos iniciais, sem senha e sem pedido. Não copiar dados do preview. O `wrangler dev` local passa a usar o nome `gaspampulha-production` para o SQLite local; o arquivo local antigo `gaspampulha` não foi apagado.

## Logs

Workers Logs do script de produção, amostragem 1, sem tracing extra e sem serviço externo. `audit_events` no D1 de produção. Os dois se encontram pelo `request_id`.

## Retenção

Expiram: `sessions`, `csrf_tokens`, `auth_attempts`. Operação: settings e produtos. Histórico: `orders`, `order_items`, `audit_events`. Não há purge automático.

## Antes do deploy

Testes, build, secret scan e asset scan verdes. D1 de produção existe e é diferente do preview. Turnstile, sitekey e secrets são os reais. Admin e migrations prontos. Rollback descrito.

## Depois do deploy

Os passos do smoke test acima.
