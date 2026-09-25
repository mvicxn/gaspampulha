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

A API `GET /accounts/…/workers/subdomain` devolveu só `subdomain: magi-tools`. O Worker `gaspampulha` continua sem versão e sem deployment, então a rota `workers.dev` desse script não está registrada. A fórmula `<nome>.magi-tools.workers.dev` não foi tratada como hostname confirmado.

O hostname previsto do workers.dev é `gaspampulha.magi-tools.workers.dev`. A rota só existe depois da publicação. O widget `Gaspampulha Production` está em modo managed e só nesse hostname. A sitekey pública de produção está em `vars.TURNSTILE_SITEKEY`. O preview e o `.dev.vars` local continuam com a sitekey de teste.

`preview_urls=false` no arquivo não prova o remoto, e `previews_enabled: false` também não conteve uma versão já criada. O `workers.dev` do script está desligado e a versão `84a71b67-99ec-4d0b-9a26-3b110e237838` ainda respondeu `/api/health`. Não religar o subdomínio nesta etapa.

A versão `84a71b67-99ec-4d0b-9a26-3b110e237838` foi enviada com o remoto ainda em `previews_enabled: true`. A contenção ligou esse campo para `false`. A URL da versão continuou em HTTP 200 por cache da borda. A versão ainda existe. Não houve deploy de tráfego.

`wrangler secret put` publica na hora. `wrangler versions secret put` não manda tráfego, mas exige uma versão já enviada e avisa para usar `wrangler versions deploy` depois. Sem versão, o secret real não tem onde ficar sem criar o Worker. O widget de produção não foi criado, para a secret não nascer só num log.

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

`seed/seed.sql` já foi aplicado em produção. Há quatro produtos. `store_name` e `whatsapp_number` estão preenchidos pelo seed. `pix_key` e `delivery_whatsapp_number` continuam vazios. Há um admin. Não há pedidos nem auditoria. `delivery_whatsapp_number` vazio é pendência operacional. Não copiar dados do preview. O `wrangler dev` local passa a usar o nome `gaspampulha-production` para o SQLite local; o arquivo local antigo `gaspampulha` não foi apagado.

## Logs

Workers Logs do script de produção, amostragem 1, sem tracing extra e sem serviço externo. `audit_events` no D1 de produção. Os dois se encontram pelo `request_id`.

## Retenção

Expiram: `sessions`, `csrf_tokens`, `auth_attempts`. Operação: settings e produtos. Histórico: `orders`, `order_items`, `audit_events`. Não há purge automático.

## Antes do deploy

Testes, build, secret scan e asset scan verdes. D1 de produção existe e é diferente do preview. Turnstile, sitekey e secrets são os reais. Admin e migrations prontos. Rollback descrito.

## Depois do deploy

Os passos do smoke test acima.
