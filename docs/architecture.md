# Arquitetura

Um Worker no plano gratuito do Cloudflare. O Vite publica o React como Static Assets. O mesmo Worker atende só `/api/*` por `run_worker_first`. As outras rotas caem no `index.html` (`not_found_handling: single-page-application`).

Um banco D1, binding `DB`. Sem segundo tenant, sem KV, sem Redis.

## O que está no ar

- `/` é a landing: produtos com preço do catálogo, pedido direto para o checkout, área, horário e contato. `/inicio` abre a mesma página
- `/loja` é a loja com carrinho. `/checkout`, `/pedido/:code` e `/admin/*` seguem iguais
- `GET /api/health` e `GET /api/catalog`. O catálogo publica produtos ativos e só `store_name`, `whatsapp_number`, `service_area` e `opening_hours`. O WhatsApp de exemplo do seed volta vazio
- Carrinho no navegador (`productId` e `quantity`, chave `gaspampulha.cart`). Preço de exibição vem do catálogo, em centavos
- Migrations `0001` a `0007`

## Pedido

`POST /api/orders` aceita itens, cliente, endereço, observação, forma de pagamento, token do Turnstile e `idempotencyKey`. O Worker confere o Turnstile em `https://challenges.cloudflare.com/turnstile/v0/siteverify`, relê o preço no D1 e grava `orders`, `order_items` e `ORDER_CREATED` no mesmo `db.batch`. O status nasce `novo` e o pagamento `pendente`. O `public_code` não é o id interno. Não há listagem pública de pedidos. O painel `/admin` usa cookie `__Host-admin_session`, CSRF nas mutações e só altera status ou pagamento.

## Admin (fase seguinte)

Cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, com token aleatório. D1 guarda `token_hash`. Senha com Web Crypto, iterações escolhidas só depois do benchmark de CPU (10 ms no Workers Free).

## Fora do runtime

n8n, gateway de pagamento, WhatsApp Business API, VPS e qualquer API de IA.
