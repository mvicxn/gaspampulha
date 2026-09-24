# Segurança

Este documento não afirma que o sistema é inviolável. Descreve o que o código faz hoje e o que continua dependente das fases de login e pedido.

## Turnstile por ambiente

Local e preview usam a sitekey pública de teste. No uso normal os dois usam a secret oficial always-pass. A secret always-fail entra só num deployment temporário de teste negativo e sai em seguida. Produção usará sitekey e secret reais, ainda não configuradas. Os valores reais não ficam neste arquivo. A secret não vai para o frontend.

## Baseline já ligado

- Toda resposta do Worker passa por `withSecurityHeaders`. CSP permite só `self` e `https://challenges.cloudflare.com`. Sem `script-src *` e sem `connect-src *`.
- HSTS só em HTTPS de host público. Localhost não recebe esse header. `public/_headers` cobre só Static Assets e não envia HSTS, porque esse arquivo não distingue produção de desenvolvimento.
- `Cache-Control: no-store` nas respostas do Worker. O mesmo header nos assets evita cache do HTML.
- JSON com teto de 8 KB, `Content-Type: application/json` e rejeição de campo desconhecido em `worker/validate.ts`.
- SQL dos helpers de audit, sessão, CSRF e rate limit usa `?` e `.bind()`.
- Erro ao cliente: `{ "error": "request_failed", "request_id" }`. Stack fica no log.
- Sem CORS aberto. O app é same-origin.
- Não há `dangerouslySetInnerHTML`.
- `isSafeRelativePath` recusa URL absoluta e `//`.
- Sessão planejada: cookie `__Host-admin_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain`. D1 guarda `token_hash`. `revokeSession` e `revokeAllSessions` apagam a linha.
- CSRF: header `x-csrf-token`, hash em `csrf_tokens`, conferência de `Origin`, token consumido no `DELETE`.
- Abuso de login: dois contadores em `auth_attempts`, janela de 15 minutos. Ver a decisão abaixo. IP não entra no audit; entra só o hash da origem.

O hash de senha continua adiado até o benchmark de CPU. Não há login completo nesta fase.

## Segredos fora do diretório publicado

J — Secrets obrigatórios nunca possuem fallback hardcoded. `TURNSTILE_SECRET` e `AUDIT_HASH_SALT` passam por `requireSecret`. Se o valor não é uma string preenchida, a função lança `missing_secret` e o cliente recebe só `request_failed` com `request_id`. `DB` continua sendo binding.

E — `worker/security/secrets.ts`. O Wrangler 4.138, em `getVarsForDev`, só emite `logger.warn` quando um nome de `secrets.required` falta. Não altera o código de saída. A trava que impede o deploy com id placeholder ou nome ausente no `.dev.vars` local é `scripts/guard-remote.mjs`.

V — O teste chama pedido e login sem os secrets e recebe 500, sem o fallback antigo. A busca no repositório não encontra esse fallback.

E — `node_modules/@cloudflare/vite-plugin/dist/index.mjs`, função `getLocalDevVarsForPreview` e `emitFile({ fileName: ".dev.vars" })`. `wrangler.jsonc` tem `secrets.required: []` no Worker principal e no preview.

V — `npm run build` não deixa `.dev.vars` em `dist/`. O teste do scanner cria um arquivo falso, falha sem imprimir o valor, e passa depois da remoção.

## Hash de senha

J — O Workers Free corta a invocação em 10 ms de CPU. Duas medições locais com `crypto.subtle` e PBKDF2-SHA-256: 10.000 iterações ficaram em mediana 4,37 ms e 4,75 ms; 20.000 passaram de 8 ms de mediana ou de 10 ms no pior sample. A escolha é 10.000. É referência desta máquina. Se o Worker real estourar CPU, o ajuste é baixar iterações.

E — `npm run benchmark:password` em 2026-09-24. O formato gravado é `pbkdf2-sha256$iteracoes$salt$hash` em `worker/security/password.ts`. O bootstrap é `ADMIN_USERNAME` e `ADMIN_PASSWORD` no comando `npm run admin:create`, sem senha no seed e sem endpoint público.

V — O teste confere que o hash não contém a senha e que a verificação aceita só a senha certa.

## Abuso de login

J — Um lockout único na conta deixa um atacante travar o administrador. A origem que erra a senha é que precisa desacelerar. A conta, no máximo, passa a exigir Turnstile e um atraso curto.

E — `registerFailure` grava `user:<hash>` e `uo:<user>:<origem>` em `auth_attempts`. Na mesma origem: 1–2 falhas seguem normais; a 3ª exige Turnstile e espera 30 s; a 4ª espera 2 min; a 5ª espera 5 min; da 6ª em diante a origem fica bloqueada por 15 min. Esse prazo não é renovado enquanto já estiver valendo. A conta, a partir da 5ª falha na janela, só exige Turnstile e espera no máximo 2 min. Login válido apaga os dois contadores. A janela de 15 min zera a contagem.

V — `tests/security.test.ts` cobre o backoff, o bloqueio que não estende sozinho, a outra origem sem bloqueio de 15 min, o fim da janela e o clear.

## Ameaças

| Ameaça | Prevenção | Detecção | Mitigação | Verificação |
|---|---|---|---|---|
| Brute force | Backoff por origem e atraso curto na conta | `AUTH_RATE_LIMITED` no audit | Bloqueio temporário da origem, não da conta | Teste de backoff e de reset da janela |
| Roubo de credencial | Senha ainda não é gravada; quando for, só hash | `ADMIN_LOGIN_FAILURE` | Revogar sessões e trocar a senha | Fase de autenticação |
| Roubo de sessão | Cookie `__Host-`, hash no D1, expiração de 12 h | Sessão usada depois do logout | `revokeSession` / `revokeAllSessions` | Cookie sem `Domain` |
| SQL injection | Bindings | Erro SQL no Workers Logs | Rejeitar o request | Audit não concatena o motivo no SQL |
| XSS | CSP fechada, sem HTML injetado | Log `SECURITY_REJECTED_REQUEST` | Resposta genérica | CSP sem curinga |
| CSRF | Origin same-site e token de uso único | Falha no `consumeCsrfToken` | 403 e audit | Teste do cookie; consumo na fase admin |
| IDOR | Sessão admin em toda rota `/api/admin` quando existir | Audit com `actor_id` | 404 genérico | Fase admin |
| Mass assignment | `parseFields` recusa chave extra | 400 | Ignorar o corpo | Teste de `price_cents` extra |
| Price tampering | Total ainda não é aceito; a fase do pedido relê o D1 | Diferença de total no audit | Recusar o campo | Schema sem preço vindo do cliente |
| Order tampering | Transição em `canChangeOrderStatus` | `ORDER_STATUS_CHANGED` | Recusar aresta inválida | Teste `novo` → `entregue` |
| Replay | CSRF de uso único e `idempotency_key` UNIQUE já na migration 0001 | Pedido duplicado | Retornar o pedido existente na fase de checkout | Constraint UNIQUE |
| Pedido duplicado | `idempotency_key` UNIQUE | Falha de constraint | Responder o pedido já criado | Migration 0001 |
| Abuso de endpoint público | Turnstile na fase do pedido; método e tamanho agora | `SECURITY_REJECTED_REQUEST` | 405/413 | `GET` estranho em `/api/health` |
| Vazamento de informação | `no-store`, erro genérico, redact de telefone e endereço | Log com dado sensível | Tratar como incidente | Teste de redact |
| Vazamento de segredo | `.gitignore` de `.dev.vars` e `.env*` | Segredo no git | Rotacionar o segredo | `git status` sem `.dev.vars` |
| Erro inseguro | Stack só no log interno | `INTERNAL_ERROR` | Resposta com `request_id` | Handler em `worker/index.ts` |
