# Arquitetura

Um Worker no plano gratuito do Cloudflare. O Vite publica o React como Static Assets. O mesmo Worker atende só `/api/*` por `run_worker_first`. As outras rotas caem no `index.html` (`not_found_handling: single-page-application`).

Um banco D1, binding `DB`. Sem segundo tenant, sem KV, sem Redis.

## O que está no ar

- `GET /api/health`
- `GET /api/catalog` lê produtos ativos e só `store_name` e `whatsapp_number`
- Carrinho no navegador (`productId` e `quantity`). Preço de exibição vem do catálogo, em centavos
- Migration `0001` e `0002`
- Tipos em `shared/types.ts`, incluindo `CheckoutDraft` sem preço

Checkout, Turnstile no pedido, sessão de uso e painel ainda não existem.

## Pedido

`POST /api/orders` aceita itens, cliente, endereço, observação, forma de pagamento, token do Turnstile e `idempotencyKey`. O Worker confere o Turnstile em `https://challenges.cloudflare.com/turnstile/v0/siteverify`, relê o preço no D1 e grava `orders`, `order_items` e `ORDER_CREATED` no mesmo `db.batch`. O status nasce `novo` e o pagamento `pendente`. O `public_code` não é o id interno. Não há listagem pública de pedidos. O painel `/admin` usa cookie `__Host-admin_session`, CSRF nas mutações e só altera status ou pagamento.

## Admin (fase seguinte)

Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, com token aleatório. D1 guarda `token_hash`. Senha com Web Crypto, iterações escolhidas só depois do benchmark de CPU (10 ms no Workers Free).

## Fora do runtime

n8n, gateway de pagamento, WhatsApp Business API, VPS e qualquer API de IA.
