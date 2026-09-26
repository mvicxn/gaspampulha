# Release candidate

Um Worker, `gaspampulha`. Local roda os testes. Preview usa `npx wrangler preview` e o D1 `gaspampulha-preview`. Produção usa o D1 `gaspampulha-production`, o Turnstile real, secrets num arquivo fora do Git e `wrangler deploy --secrets-file`, só depois de `npm run predeploy`. Version URL não faz parte desse fluxo. `preview_urls` fica `false`. `workers_dev` fica `true` para o hostname `gaspampulha.magi-tools.workers.dev`. Domínio próprio pode entrar depois. Não há DNS nesta fase.

O caminho até publicar:

1. Git limpo.
2. Preview validado.
3. D1 de produção existente.
4. Turnstile de produção existente.
5. Secrets de produção preparados.
6. `npm run predeploy`.
7. Admin com `ADMIN_CONFIRM` igual ao id do banco.
8. Deploy.
9. Smoke test.
10. Logs.

A publicação de produção usa `wrangler deploy` direto, com `--secrets-file`. Não usa Version URL.

O pedido de smoke test, se for criado depois do deploy, fica como registro de validação. Não há política de apagar pedido. Não remover esse registro com SQL avulso.

O binding de desenvolvimento não leva `preview_database_id`: isso fez o `wrangler dev` abrir um SQLite vazio e o catálogo responder 500.

## Local

`npm run dev` usa o D1 local `gaspampulha`. Migrations:

```bash
npx wrangler d1 migrations apply gaspampulha --local
```

`.dev.vars` traz `TURNSTILE_SECRET` e `AUDIT_HASH_SALT`. Esse arquivo não entra no Git. A sitekey pública de teste fica no `.dev.vars` local e no bloco `previews`. A de produção fica em `vars.TURNSTILE_SITEKEY`. O frontend lê `turnstileSiteKey` em `GET /api/health`.

## Preview

O bloco `previews` do mesmo Worker aponta para o D1 `gaspampulha-preview`, id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Não há `env.preview` nem um segundo Worker. Migrations remotas usam só `wrangler.preview-migrations.jsonc`, binding `PREVIEW_DB`, o mesmo id.

```bash
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
npm run preview
```

A sitekey de preview é a de teste. A secret normal é a always-pass. A always-fail só entra num deployment temporário de teste negativo. O salt de preview é aleatório e não é o de produção. Valores não ficam no config.

## Produção

D1 `gaspampulha-production`. `npm run deploy` chama `scripts/guard-remote.mjs production`. Ele para se o id for o placeholder ou igual ao do preview, se a sitekey de `vars` for a de teste, se secret aparecer em `vars`, se `preview_urls` não for `false` ou se a Version URL remota estiver ligada.

Os secrets já gravados no Worker são mantidos por padrão:

```
GASP_KEEP_REMOTE_SECRETS=1 npm run predeploy
GASP_CONFIRM_DEPLOY=<database_id de produção> GASP_KEEP_REMOTE_SECRETS=1 npm run deploy
```

Nesse modo o guard confere por `wrangler secret list` que `TURNSTILE_SECRET` e `AUDIT_HASH_SALT` existem e roda `wrangler deploy` sem `--secrets-file`. Trocar um secret continua sendo `GASP_SECRETS_FILE=<arquivo fora do repo>`. Trocar `AUDIT_HASH_SALT` muda os hashes do audit a partir dali.

Migration nova vai antes do deploy: `npx wrangler d1 migrations apply gaspampulha-production --remote`. As migrations só inserem ou alteram de forma compatível com a versão no ar.

## Build e testes

```bash
npm test
npm run build
npm run verify:assets
npm run secret-scan
npm run benchmark:password
```

`npm run secret-scan` percorre o source, com untracked. `npm run verify:assets` percorre só `dist/`. Os dois precisam passar. `verify:assets` falha se `dist/` contiver `.dev.vars` ou um valor de secret. O plugin apaga o `.dev.vars` emitido no build antes dessa verificação.

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
