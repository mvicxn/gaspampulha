# Decisões desta etapa

## Um Worker com Vite plugin, SPA fallback e API em `/api/*`

J — O guia atual de React + Vite da Cloudflare cobre Static Assets e o Worker no mesmo projeto. Pages seria um segundo produto sem função aqui.

E — [React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) define `not_found_handling: single-page-application` e `run_worker_first: ["/api/*"]`, com array suportado no Vite plugin 1.7+ e Wrangler 4.20+.

V — `npm run dev` serve a página e `GET /api/health` devolve JSON. Uma rota desconhecida de página não passa pelo Worker.

## D1 single-tenant com migration e seed separados

J — Um comércio, um banco. O seed reaplica dados editáveis; a migration só cria estrutura. Senha no SQL versionado vazaria no git.

E — O repositório não tinha banco. [Limites do D1](https://developers.cloudflare.com/d1/platform/limits/) no Workers Free: 10 bancos por conta, 500 MB por banco. O `database_id` placeholder precisa ser trocado pela saída de `wrangler d1 create` antes do deploy remoto.

V — `seed/seed.sql` não contém `INSERT` em `admin_users`. `migrations/0001_init.sql` não contém senha.

## `order_items` guarda nome e preço, sem FK para `products`

J — O pedido antigo tem de mostrar o que foi vendido mesmo se o produto mudar ou sumir.

E — Colunas `product_name` e `unit_price_cents` em `order_items`. `product_id` é inteiro solto.

V — A migration cria `order_items` sem `REFERENCES products`.

## Hash de senha adiado

J — O Workers Free corta a invocação em 10 ms de CPU. Escolher iterações de PBKDF2 agora seria chute.

E — [Limits](https://developers.cloudflare.com/workers/platform/limits/): 10 ms de CPU por invocação no plano Free.

V — Não há função de hash nem usuário admin nesta etapa. O comando de criação do primeiro admin entra na fase de autenticação, depois da medição.

## Dependências

J — Só o que o template React + TypeScript do Vite 8 e o guia da Cloudflare pedem para build e Worker.

E — `react` 19.3.0, `react-dom` 19.3.0, `vite` 8.3.1, `@vitejs/plugin-react` 6.1.1 e `typescript` 6.0.3 vêm do `create-vite@9.2.1` (`react-ts`). `@cloudflare/vite-plugin` 1.59.0, `wrangler` 4.138.0 e `@cloudflare/workers-types` 5.20260924.1 vêm do [guia React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/). O Wrangler 4.138 pede `workers-types` 5.x.

V — `package.json` não inclui React Router, cliente de WhatsApp, gateway, ORM nem SDK de IA. `npm run build` termina sem erro.
