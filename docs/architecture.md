# Arquitetura inicial

## Separação de produtos

- `entregaplus-app-entregador`: aplicativo Flutter do entregador.
- `chamaentrega-dashboard-loja`: painel web Next.js da loja.
- Supabase `entrega-plus`: backend compartilhado.

## Autorização

O dashboard não usa `service_role`. O navegador recebe somente a publishable key e todas as consultas são feitas como o usuário autenticado.

A loja é resolvida por `stores.owner_id = auth.uid()`. As políticas RLS existentes permitem ao lojista:

- visualizar suas entregas;
- criar entregas da própria loja;
- atualizar entregas da própria loja.

## Publicação da corrida

`draft` → loja ainda preparando.

Ao clicar em **PEDIDO PRONTO**:

- `status = available`
- `ready_at = now()`
- `published_at = now()`
- `expires_at = now() + 5 min`

A partir daí o app do entregador recebe a nova linha pela publicação `supabase_realtime` da tabela `deliveries`.
