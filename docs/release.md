# Release candidate

Um Worker, `gaspampulha`. Três usos do banco: local, preview e produção. O binding de desenvolvimento não leva `preview_database_id`: isso fez o `wrangler dev` abrir um SQLite vazio e o catálogo responder 500.

## Local

`npm run dev` usa o D1 local `gaspampulha`. Migrations:

```bash
npx wrangler d1 migrations apply gaspampulha --local
```

`.dev.vars` traz `TURNSTILE_SECRET` e `AUDIT_HASH_SALT`. Esse arquivo não entra no Git. A sitekey pública de teste está em `vars.TURNSTILE_SITEKEY`. O frontend lê `turnstileSiteKey` em `GET /api/health`.

## Preview

O bloco `previews` do mesmo Worker aponta para o D1 `gaspampulha-preview`, id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Não há `env.preview` nem um segundo Worker. Migrations remotas usam só `wrangler.preview-migrations.jsonc`, binding `PREVIEW_DB`, o mesmo id.

```bash
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
npm run preview
```

A sitekey de preview é a de teste. A secret normal é a always-pass. A always-fail só entra num deployment temporário de teste negativo. O salt de preview é aleatório e não é o de produção. Valores não ficam no config.

## Produção

O `database_id` principal continua `00000000-0000-0000-0000-000000000000`. O banco não existe. `npm run deploy` chama `scripts/guard-remote.mjs production` e para se o id for esse placeholder, se for igual ao do preview, se a sitekey do bloco `vars` for a de teste, ou se `TURNSTILE_SECRET` ou `AUDIT_HASH_SALT` aparecerem em `vars`. Os placeholders ficam de propósito.

Quando for a hora, um humano cria outro D1, troca o id, configura sitekey e secrets reais, e só então roda `npm run deploy`. Sem DNS nesta etapa.

## Build e testes

```bash
npm test
npm run build
npm run verify:assets
npm run secret-scan
npm run benchmark:password
```

`verify:assets` falha se `dist/` contiver `.dev.vars` ou um valor de secret. O plugin apaga o `.dev.vars` emitido no build antes dessa verificação.

## Rollback

O preview tem URL estável e deployments numerados no painel. Voltar é escolher o deployment anterior do preview `gaspampulha-rc`. Não há script de `DROP` nem de apagar D1. Produção ainda não tem deployment para reverter.

## Segredos

Por ambiente, fora do Git:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put AUDIT_HASH_SALT
```

`secrets.required` lista `TURNSTILE_SECRET` e `AUDIT_HASH_SALT`. O plugin ainda pode escrever esses valores em `dist/<worker>/.dev.vars` durante o build, para o preview local. O plugin do Vite `strip-emitted-dev-vars` apaga esse arquivo antes de `verify:assets`, e recusa chave que não esteja na lista. O nome `TURNSTILE_SECRET` aparece só em `dist/gaspampulha/index.js`, como `env.TURNSTILE_SECRET`. O valor não aparece. O client não contém esse nome.

Chave de teste do Turnstile, documentada pela Cloudflare, serve para local e preview. Produção usa o par sitekey/secret do widget real. A de teste não entra no git.

O primeiro admin de cada banco remoto é um insert do hash, no D1 daquele ambiente. O script `npm run admin:create` grava só no D1 local.

O script `npm run admin:create` grava no D1 local. Não apontá-lo para produção nesta fase.

## Domínio

O Worker pode receber um custom domain depois, no painel da Cloudflare, no hostname do Worker de preview ou de produção. Não há DNS nesta etapa.

## Observabilidade

`observability.enabled` e `invocation_logs` estão ligados, com `head_sampling_rate` 1, no Worker principal e no preview. Para uma loja só, isso evita perder o request de um incidente. O teto do plano gratuito dos Workers Logs precisa ser conferido na conta antes do tráfego real. Não há tracing extra.

## Retenção

| Dado | Onde | Crescimento | Limpeza futura |
|---|---|---|---|
| orders, order_items | D1 | um insert por pedido | não apagar; é o histórico |
| audit_events | D1 | um insert por ação | arquivar por data, sem apagar incidente recente |
| sessions | D1 | um insert por login | apagar `expires_at` vencido |
| csrf_tokens | D1 | um insert por mutação | apagar `expires_at` vencido |
| auth_attempts | D1 | uma linha por sujeito | apagar janela vencida |

Não há job de limpeza nesta fase.

## Dados pessoais

`customer_name`, `phone` e endereço ficam em `orders` no D1 e na resposta de `GET /api/admin/orders` para o operador autenticado. O navegador do admin mostra esses campos. O audit guarda o `public_code` e a mudança de status, não o telefone nem o endereço. O log do Worker guarda rota, status e `request_id`. Não há listagem pública de pedidos.
