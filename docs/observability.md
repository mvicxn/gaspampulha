# Observabilidade

Dois canais, com papéis diferentes.

## Workers Logs

`wrangler.jsonc` liga `observability.enabled`, `logs.invocation_logs` e `head_sampling_rate` 1. Cada request do Worker passa por `logger.info` com `request_id`, método, rota, status e `duration_ms`. Erro interno usa `logger.error` e inclui `error_code` e stack. Evento de segurança usa `logger.security`.

O logger redige chaves de senha, hash, token, cookie, Authorization, Turnstile, segredo, telefone e endereço. O cliente não recebe stack.

Não há serviço externo de log e não há banco separado para log de request. A consulta é o painel de Workers Logs, filtrando pelo `request_id`.

`wrangler tail` não aponta para Preview. O log do preview fica no painel do próprio preview: Workers, script `gaspampulha`, Previews, slug `gaspampulha-rc`, Observability. O deployment atual aparece na mesma página. Métricas de invocação ficam nesse painel, não num segundo Worker.

Para achar um request: copiar o `request_id` da resposta de erro ou de `audit_events.request_id` e filtrar a mensagem do log. O campo `event` do JSON é o nome interno (`ORDER_CREATE_TURNSTILE_REJECTED`, `SECURITY_REJECTED_REQUEST`, `request`). A consulta pela API `workers/observability/telemetry/query` nesta conta devolveu erro de autenticação 10000; o caminho usado aqui é o painel do preview.

O `request_id` da resposta de erro é o mesmo valor do log estruturado. No painel, o botão de copiar na auditoria leva esse id para a busca nos Workers Logs. Não há link direto para o painel da Cloudflare.

Ação de pedido, produto, configuração e entrega vai para `audit_events`. Falha técnica vai para o log. Os dois se encontram pelo `request_id`.

## Audit

`audit_events` no D1 registra ação relevante, não o request bruto. O helper é `auditEvent` em `worker/audit.ts`. Ações previstas: login, logout, pedido, status, pagamento, produto, settings, rate limit, request rejeitado e erro interno.

IP e User-Agent, quando forem usados, entram só como hash. O pepper é `AUDIT_HASH_SALT`. Sem ele o Worker para. O valor fica fora do git.
