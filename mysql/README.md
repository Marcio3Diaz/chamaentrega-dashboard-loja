# Migração Supabase → MySQL

Esta pasta contém a base da migração gradual do ChamaEntrega.

## Estratégia

1. Supabase continua ativo para autenticação, MFA, Storage, Realtime e Edge Functions.
2. O MySQL entra primeiro como banco operacional para lojas, pedidos e entregas.
3. Os nomes das tabelas e colunas foram mantidos próximos aos atuais para reduzir mudanças no frontend.
4. O seletor `DATABASE_PROVIDER` permite manter `supabase` como padrão até que cada módulo esteja validado.
5. A troca para `DATABASE_PROVIDER=mysql` só deve acontecer depois que o driver, consultas e sincronização inicial estiverem prontos.

## Arquivos

- `001_core.sql`: schema inicial das tabelas que alimentam o painel.
- `lib/database/provider.ts`: seletor de provedor.
- `lib/database/mysql-config.ts`: parser seguro da URL MySQL.
- `lib/data/operational-repository.ts`: contrato que o frontend poderá usar independentemente do banco.

## Próxima etapa

Adicionar `mysql2` com o lockfile atualizado, criar o pool de conexões e implementar o repositório MySQL sem remover o repositório Supabase.
