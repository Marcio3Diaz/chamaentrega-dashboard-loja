# ChamaEntrega — Dashboard da Loja

Painel web separado do app do entregador, conectado ao mesmo Supabase do ChamaEntrega.

## Stack

- Next.js 16.3.5 (App Router / Active LTS)
- React 19.3
- TypeScript 7
- Supabase Auth + Postgres + Realtime
- CSS próprio, sem framework visual adicional

## O que já funciona

- Login com Supabase Auth
- Validação de usuário `store_owner` / `admin`
- Resolução automática da loja pelo `stores.owner_id`
- Visão geral com indicadores operacionais
- Entregas em tempo real via `postgres_changes`
- Criação de entrega como rascunho
- Botão **PEDIDO PRONTO — BUSCAR ENTREGADOR** que publica a entrega como `available`
- RLS do banco continua sendo a camada de autorização
- Páginas-base para Entregadores, Financeiro, Integrações e Configurações

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

> Copie `.env.example` para `.env.local` e preencha a URL e a chave **publishable** do Supabase. O `.env.local` é ignorado pelo Git e nunca deve ser versionado.

## Regra de negócio preservada

Uma entrega pode ser salva como `draft`. Somente quando a loja clicar em **PEDIDO PRONTO** ela passa para `available`, recebe `published_at`, `ready_at` e `expires_at`, ficando visível para os entregadores online.

## Próximas etapas

1. Autocomplete/geocodificação de endereço do cliente.
2. Mapa em tempo real do entregador.
3. Rede de entregadores por loja.
4. Financeiro + comprovantes Pix.
5. Integrações iFood, 99Food, WhatsApp e Goomer.
6. Multiusuário por loja com permissões (gerente/atendente).
