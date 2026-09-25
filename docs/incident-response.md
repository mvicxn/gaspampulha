# Resposta a incidente

## INCIDENTE: PUBLIC VERSION URL

Status: CLOSED.

Data: 2026-09-25.

Impacto: a versão `84a71b67-99ec-4d0b-9a26-3b110e237838` ganhou a URL pública `https://84a71b67-gaspampulha.magi-tools.workers.dev`, com o D1 de produção `793f344d-b581-4d59-a46a-4e8525903180`.

Recursos potencialmente expostos: o Worker e o D1 de produção. Os secrets `TURNSTILE_SECRET` e `AUDIT_HASH_SALT` estavam só no binding server-side. Não há evidência de que os valores saíram em resposta HTTP, log público ou bundle. É exposição de superfície de execução, sem evidência de vazamento dos valores.

Escritas observadas antes da contenção: 0 pedidos, 0 admins, 0 auditorias. Nenhuma linha de audit foi criada para este incidente.

Causa: `preview_urls: false` no arquivo local ainda não tinha sido aplicado ao recurso remoto. No momento do `versions upload`, `previews_enabled` estava `true`.

Contenção tentada: `previews_enabled` e depois `enabled` foram para `false`. `GET /api/health` com query inédita continuou executando o Worker. O metadata da versão `84a71b67-99ec-4d0b-9a26-3b110e237838` não listou URLs, mas a execução já tinha sido observada. Secrets omitidos num `versions upload` são preservados da versão anterior. A versão `a7bd294f-a4b1-4ae7-a72e-88ebb8dc4b67` não recebeu D1, mas manteve os secret bindings. Com essa segunda versão existente, o DELETE da `84a71b67-99ec-4d0b-9a26-3b110e237838` retornou sucesso. A consulta posterior não encontra essa versão. A secret do widget de produção foi rotacionada com invalidação imediata. O valor novo não está no Git. Não há evidência observada de exfiltração dos valores. O `workers.dev` segue desligado. `workers.dev=false` não desligou a Version URL já criada. A versão exposta foi removida. O fluxo de release deixou de usar Version URL. A publicação passa a ser `wrangler deploy --secrets-file`, depois do predeploy. O Preview continua sendo o ambiente de teste. Não há evidência de exfiltração. O D1 de produção não foi alterado.

Lição: `preview_urls=false` no arquivo não prova que Version URLs estão desabilitadas no remoto. Qualquer upload de versão tem de ler esse estado antes. Se a leitura falhar, o processo para.



1. Pegue o `request_id` na resposta JSON (`request_failed`) ou no horário aproximado do relato.
2. No painel do Worker, abra Workers Logs e filtre esse `request_id`. O log traz rota, status, `error_code` e, no erro interno, a stack.
3. No D1, consulte `audit_events` pelo mesmo `request_id`. Se não houver linha, o evento não chegou a uma ação auditada; o log operacional ainda existe.
4. O deployment é o que o Wrangler publicou por último: `wrangler deployments list`. Compare o horário do incidente com o deploy.
5. Se o incidente for um pedido ou uma conta admin, pare de usar essa sessão: apague as linhas daquele `admin_id` em `sessions` e `csrf_tokens`. Não reuse o token.
6. Revogação: `DELETE FROM sessions WHERE admin_id = ?` ou `DELETE FROM sessions WHERE token_hash = ?`. O cookie no browser expira, mas a linha no D1 é o que invalida.
7. Credencial comprometida: troque a senha do admin só pelo fluxo que gravar hash novo, depois de apagar as sessões. Não cole a senha em issue, log ou `AI_BRAIN.md`.
8. Preserve o `request_id`, o trecho do Workers Logs, a linha de `audit_events` e o id do deployment. Não exporte cookie, token ou senha.
9. A correção entra no git com o que mudou na prevenção. O audit de incidente não substitui o commit.
10. Atualize `AI_BRAIN.md`: `KNOWN ISSUES`, `LAST CHANGE` e `HANDOFF`, sem segredo e sem dado pessoal.

## Exemplo local

Um `POST /api/admin/orders/1` sem CSRF devolveu `request_failed` com um `request_id`. O log do Worker, no mesmo id, é `SECURITY_REJECTED_REQUEST` na rota do PATCH, status 403, sem senha e sem cookie. Não há linha nova em `audit_events` para essa rejeição de CSRF, porque a mutação não aconteceu. A sequência fica: request sem token, 403, log com o id, audit intacto. A correção operacional é reemitir o CSRF pelo login ou pela mutação anterior, não repetir o token gasto.
