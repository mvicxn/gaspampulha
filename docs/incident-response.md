# Resposta a incidente

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
