# Decisões

## Âncora do release candidate

J — Estabelecer uma âncora versionada antes da produção.

E — Release candidate validado no local e no Preview remoto. O id de produção continua placeholder. `npm run deploy` recusa esse id, a sitekey de teste e secret dentro de `vars`.

V — O primeiro commit existe, a árvore de trabalho fica limpa, e `npm test` com `npm run build` passam nesse estado.

## Teste positivo do Turnstile não prova rejeição

J — A secret oficial always-pass aceita qualquer token. Um 201 com token “inválido” não é falha de validação.

E — Preview com `1x…AA` no secret. Pedido com token qualquer retornou 201 na fase 7.4.

V — Com a secret always-fail `2x…AA`, temporária no deployment 3, `POST /api/orders` voltou 403, `request_id` `c67ae42d-eaea-4ea6-acb1-d742d1fee7bf`, zero pedidos novos e zero `ORDER_CREATED`. O login admin voltou 403, `request_id` `9c6b1b98-e332-491d-b909-e2ce42198446`, sem sessão nova e sem `ADMIN_LOGIN_SUCCESS`. A rejeição do login acontece antes do audit de senha errada, então não há linha de audit; o evento de log é `SECURITY_REJECTED_REQUEST`. O evento do pedido é `ORDER_CREATE_TURNSTILE_REJECTED`. O deployment 4 voltou à secret always-pass. Pedido `SHPW6LJD` 201 e login 200.

## Observabilidade do preview

J — `wrangler tail` não seleciona Preview. Correlacionar pelo `request_id` evita vasculhar PII.

E — `docs/observability.md`. Painel do preview `gaspampulha-rc`. Audit guarda o mesmo id que o logger.

V — Pedido restaurado `SHPW6LJD` tem `audit_events.request_id` `81295a6d-63db-4a3b-bc53-baace771b67b`. A resposta 403 do teste negativo trouxe o id e não trouxe o token. A API de telemetry desta conta respondeu 10000; a leitura do JSON do log no painel continua manual.

## Fonte de continuidade no Git

J — `.cursor/` é estado do editor, não a memória do projeto.

E — Continuidade em `AI_BRAIN.md` e `docs/**`. `.gitignore` inclui `.cursor/`. O diretório permanece no disco.

V — `git status --short` não lista `.cursor/`. `git ls-files` não lista `.cursor`, `.dev.vars` nem `.env`.

## Isolamento do preview

J — Evitar que o preview escreva no banco da loja.

E — Preview no Worker principal, bloco `previews`. D1 remoto `gaspampulha-preview`, id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5`. Migrations só por `wrangler.preview-migrations.jsonc`.

V — Pedido `NFKF8D6A` está nesse D1. `wrangler d1 list` não tem outro banco `gaspampulha`. O id de produção no config continua o placeholder zero.

## Turnstile por ambiente

J — A sitekey pública de teste não pode ser a chave real da loja, e a secret de teste não pode ir para produção.

E — `vars.TURNSTILE_SITEKEY` e `previews.vars.TURNSTILE_SITEKEY` usam a sitekey de teste. A secret de preview é a secret oficial always-pass, enviada no deploy e ausente do git. A guarda de produção recusa deploy enquanto a sitekey do config for a de teste.

V — `GET /api/health` no preview devolve a sitekey de teste. Pedido e login no navegador passaram. Token inválido com essa secret ainda passa; 403 fica para a secret real.

## Separação de segredo

J — O salt de preview não pode ser o salt local nem um valor commitado.

E — `AUDIT_HASH_SALT` e `TURNSTILE_SECRET` foram para o preview por arquivo temporário fora do repositório, apagado depois. `base-config secret put` exige o script de produção, que não existe.

V — O JSON do deploy mostra os dois como `secret_text`, sem valor. `verify:assets` passou. Os valores não estão em `wrangler.jsonc`.

## Alvo da migration

J — Aplicar migration com o config principal poderia apontar para produção quando esse id deixar de ser placeholder.

E — `wrangler.preview-migrations.jsonc` tem um único binding, `PREVIEW_DB`, com o mesmo nome e id do bloco `previews`.

V — O apply remoto confirmou o id `6fb672ad-dae3-424c-b01f-b287b1ea2aa5` e o nome `gaspampulha-preview`.

## Segredos nunca entram no diretório de assets publicado

J — O preview local do Worker lia `.dev.vars` e o plugin gravava uma cópia em `dist/gaspampulha/`. Gitignore não impede esse arquivo de ir parar num artefato de deploy. A correção é na configuração que o plugin consulta, e o scanner é a segunda trava.

E — `getLocalDevVarsForPreview` em `@cloudflare/vite-plugin` emite `.dev.vars` quando há variáveis carregadas. Com `secrets.required` vazio, `getVarsForDev` não repassa os valores do arquivo. `scripts/assert-no-secrets-in-assets.mjs` percorre `dist/`.

V — Depois de `npm run build`, `dist/gaspampulha/` não contém `.dev.vars`. `npm run verify:assets` passa. O teste com arquivo falso falha e não imprime o conteúdo.

## Preview isolado da produção

J — Um deploy de preview não pode escrever no banco da loja. O Worker de preview tem outro nome e outro `database_id`. Os dois ids no arquivo ainda são placeholders, e o script de deploy recusa esses valores. Segredo não entra no git: o scan lê só `git ls-files`. O catálogo, o admin e a auditoria saem com `Cache-Control: no-store`. Workers Logs ficam em amostragem 1 porque a loja é uma só e um incidente não pode ser sorteado para fora; o custo do plano gratuito tem de ser visto na conta.

E — `wrangler.jsonc`, `scripts/guard-remote.mjs`, `scripts/secret-scan.mjs`, `docs/release.md`. `withSecurityHeaders` define `no-store`.

V — `npm run deploy:preview` termina sem publicar enquanto o id for placeholder. O scan dos arquivos rastreados não acha a chave de teste. O bundle do client não contém `TURNSTILE_SECRET`.

## Decision Engine próprio

J — O projeto precisa de decisão tipada e policy em código, sem acoplar o workflow a um fornecedor.

E — `src/decision/providers/types.ts` define `DecisionProvider`. O único código de provider nesta fase é `MockProvider`. Não há SDK de modelo no `package.json`.

V — `npm test` valida schema, policy e os três casos em `docs/jev/evals/cases.json`.

## Workers Logs, audit no D1

J — Log operacional fica na plataforma. Audit é evento de negócio e segurança, com retenção no mesmo banco single-tenant.

E — `wrangler.jsonc` usa `observability.enabled` conforme a [documentação de Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). `audit_events` está em `migrations/0002_observability_security.sql`.

V — `GET /api/health` emite log JSON com `request_id`. Um `INSERT` local em `audit_events` sucede depois da migration.

## Cookie `__Host-admin_session` e CSRF à parte

J — `__Host-` impede `Domain` e exige `Secure` e `Path=/`. SameSite=Lax permite abrir `/admin` a partir de um link. Mutação admin ainda exige Origin igual e token de CSRF de uso único.

E — `worker/security/session.ts` e `worker/security/csrf.ts`. A tabela `csrf_tokens` guarda só o hash.

V — O teste do cookie não encontra `Domain=`. O login completo continua fora desta fase.

## Operação do painel sem polling

J — A loja atualiza o pedido com um clique e um refetch. Polling gastaria leitura do D1 o dia inteiro sem fila automática. A busca fica no Worker, com `LIKE` e parâmetros, teto de 40 caracteres. A lista e a auditoria ordenam por data e `id`, no máximo 50 linhas. O WhatsApp do entregador é `delivery_whatsapp_number`, separado do número público da loja, e o catálogo não o devolve. O preço do card continua o de `order_items`.

E — `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `POST /api/admin/orders/:id/delivery-link`, `GET /api/admin/audit`, `worker/admin/delivery.ts`, migration `0006`.

V — O link do entregador abre `https://web.whatsapp.com/send`, sem o protocolo `whatsapp://`, que o desktop recusa quando o aplicativo não está instalado. O teste recusa URL arbitrária e confirma que o número do entregador não entra no catálogo. `GET /api/admin/audit` sem sessão responde 401.

## Produto não se apaga e a edição carrega versão

J — O item do pedido guarda nome e preço da venda. Apagar o produto quebraria essa referência operacional e não é necessário: `active = 0` tira o item do catálogo. Duas edições do mesmo preço não podem se sobrescrever; o PATCH exige `version` e o `UPDATE` só ocorre se ela ainda for a lida. Settings públicas são só `store_name`, `whatsapp_number` e `pix_key`. O WhatsApp aceita dígitos, não URL. A chave PIX não entra no log nem no audit.

E — `migrations/0005_product_version.sql`, `worker/admin/manage.ts`, `worker/catalog.ts`. O catálogo público continua filtrando `active = 1`.

V — Testes recusam float, HTML, URL no WhatsApp e mostram o preço histórico separado do preço novo. O PATCH local com versão velha responde 409. O catálogo deixa de listar o produto desativado e o pedido antigo mantém `unit_price_cents`.

## Admin, sessão e concorrência do pedido

J — O cookie `__Host-admin_session` não vai para o D1; só o hash. Login sempre emite token novo e ignora token na URL. Mutação de pedido exige CSRF de uso único e `Origin`. O `UPDATE` só ocorre se o status atual ainda for o lido; o audit entra no mesmo batch apenas se esse status novo existir. A listagem limita `limit` a 50. O contador de login usa um único `INSERT ... ON CONFLICT` para duas falhas simultâneas não gravarem o mesmo número.

E — `worker/admin/http.ts`, `worker/security/password.ts`, `worker/security/login-attempt.ts`, `migrations/0004_session_created_at.sql`.

V — Testes de hash, 401 sem sessão, token na query e contador serializado. O fluxo local cria o admin, entra, muda status e pagamento, recusa PATCH sem CSRF e invalida a sessão no logout.

## Pedido criado no Worker

J — O clique duplo não pode virar dois pedidos, e o preço do navegador não pode entrar no total. O `db.batch` do D1 executa os inserts do pedido, dos itens e do audit na mesma transação. A chave `idempotency_key` é UNIQUE: a segunda request perde a corrida e relê o pedido. O `public_code` sai de 8 caracteres aleatórios, sem o id interno. O Turnstile roda antes de qualquer insert. A chave de teste da Cloudflare devolve `hostname: example.com`; isso só é aceito quando a própria resposta traz `result_with_testing_key`.

E — `worker/orders/create.ts` e `worker/orders/turnstile.ts`. A constraint está em `migrations/0001_init.sql`. O batch transacional está descrito na documentação de D1: statements do batch compartilham uma transação e um erro desfaz o lote. Siteverify: `https://challenges.cloudflare.com/turnstile/v0/siteverify`.

V — `tests/orders.test.ts` cobre campo extra, preço do D1, replay, 409 de carrinho diferente, rollback de item e de audit, e Turnstile inválido. O POST local com a chave de teste grava um pedido, um item e um `ORDER_CREATED`, e a repetição devolve o mesmo `public_code`.

## Catálogo público e carrinho local

J — O preço do pedido será recalculado no Worker. Guardar o carrinho no D1, ou tratar o preço do navegador como verdade, antecipa a fase do pedido sem ganho. Cache longo do `GET /api/catalog` mostraria preço velho depois de uma alteração na loja. A resposta segue `Cache-Control: no-store`, o mesmo header das outras rotas do Worker.

E — `worker/catalog.ts` seleciona `active = 1` e settings `store_name` e `whatsapp_number`. `src/cart.ts` persiste só `productId` e `quantity`. `toCheckoutDraft` não tem campo de preço. `withSecurityHeaders` define `no-store`.

V — `tests/catalog.test.ts` cobre catálogo vazio, inativo, ordem, limite 20, total em centavos e rascunho sem preço. `GET /api/catalog` local não devolve produto inativo nem `pix_key`.

## Rate limit de login no D1

J — Memória do isolate não é compartilhada entre requests. A contagem tem de sobreviver a outro isolate.

E — `d1AuthAttemptStore` lê e grava `auth_attempts`. O teste da regra usa um store injetado; o caminho de produção é o D1.

V — A 3ª falha na mesma origem pede Turnstile e backoff. A 6ª bloqueia só essa origem por 15 minutos. Outra origem não herda esse bloqueio. A janela de 15 minutos zera a contagem.
