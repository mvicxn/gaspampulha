# Gaspampulha

MVP single-tenant de pedidos para um comércio local de água e gás. Um comércio, uma aplicação, um banco D1.

## Stack

React, TypeScript, Vite, Cloudflare Vite Plugin, Workers, Static Assets e D1. Turnstile e WhatsApp via `wa.me` entram nas fases seguintes.

## Desenvolvimento

```bash
npm install
npm run dev
```

`GET /api/health` responde `{ "ok": true, "service": "gaspampulha" }`.

## Banco local

O `database_id` em `wrangler.jsonc` é um placeholder. Antes do deploy remoto:

```bash
npx wrangler d1 create gaspampulha
```

Substitua o `database_id` pelo valor impresso. Aplique o schema e o seed em separado:

```bash
npx wrangler d1 migrations apply gaspampulha --local
npx wrangler d1 execute gaspampulha --local --file=seed/seed.sql
```

`admin_users` fica vazio. Senha não entra em migration nem em seed. O comando que cria o primeiro admin será feito na fase de autenticação, depois de medir o hash no limite de CPU do Workers Free.

## Segredos

Nomes em `.env.example`. Valores locais em `.dev.vars`, que não é versionado.
