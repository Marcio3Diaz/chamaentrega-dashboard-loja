# Migração Supabase → MySQL

Esta pasta contém a base da migração gradual do ChamaEntrega.

## Estratégia

1. Supabase continua ativo para autenticação, MFA, Storage, Realtime e Edge Functions.
2. O MySQL entra primeiro como banco operacional para lojas, pedidos e entregas.
3. Os nomes das tabelas e colunas foram mantidos próximos aos atuais para reduzir mudanças no frontend.
4. O seletor `DATABASE_PROVIDER` permite manter `supabase` como padrão até que cada módulo esteja validado.
5. A troca para `DATABASE_PROVIDER=mysql` só deve acontecer depois que a sincronização inicial estiver validada.

## MySQL local com Docker

O projeto possui `docker-compose.mysql.yml`.

Subir:

```bash
npm run db:mysql:up
```

A conexão local é:

```env
MYSQL_DATABASE_URL=mysql://chamaentrega:chamaentrega_dev@127.0.0.1:3307/chamaentrega
```

Parar sem apagar os dados:

```bash
npm run db:mysql:down
```

Apagar o volume e recriar do zero:

```bash
npm run db:mysql:reset
npm run db:mysql:up
```

O Docker executa automaticamente:

- `mysql/001_core.sql`
- `mysql/002_align_store_members.sql`
- `mysql/003_align_supabase_core_fields.sql`

A porta é publicada somente em `127.0.0.1:3307`, portanto o MySQL não fica exposto para outros computadores da rede.

## Windows: setup rápido

Pré-requisito: Docker Desktop instalado e aberto.

No PowerShell, dentro da pasta do projeto:

```powershell
npm run db:mysql:setup
```

O script:

1. verifica se o Docker está instalado;
2. sobe o MySQL 8.4;
3. aguarda o healthcheck;
4. confirma com `MYSQL_LOCAL_OK`;
5. mostra as variáveis que devem entrar no `.env.local`.

Para o ambiente local de transição use:

```env
DATABASE_PROVIDER=mysql
MYSQL_DATABASE_URL=mysql://chamaentrega:chamaentrega_dev@127.0.0.1:3307/chamaentrega
MYSQL_SYNC_FROM_SUPABASE=true
```

Mantenha também no `.env.local` as variáveis públicas atuais do Supabase, pois Auth e Realtime continuam ativos durante a transição.

## Teste do schema

Com o MySQL local ativo e `MYSQL_DATABASE_URL` configurada:

```bash
npm run db:test:mysql
```

O teste insere dados fictícios dentro de uma transação e executa rollback no final. Nenhum dado de teste permanece no banco.

## Dry-run da migração

Configure também uma service role somente no ambiente administrativo:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

Nunca use prefixo `NEXT_PUBLIC_` nessa chave.

Execute:

```bash
npm run db:migrate:mysql
```

O modo padrão é dry-run: lê e conta os dados do Supabase, mas não grava no MySQL.

## Aplicar a cópia

Somente depois do dry-run:

```bash
npm run db:migrate:mysql -- --apply
```

O processo usa transação. Em caso de falha, faz rollback.

## Comparar os bancos

Depois da cópia:

```bash
npm run db:verify:mysql
```

São comparadas as contagens de:

- profiles
- stores
- store_members
- couriers
- deliveries
- store_orders

## Ativação

Mesmo após a cópia, mantenha inicialmente:

```env
DATABASE_PROVIDER=supabase
```

Só altere para `mysql` depois de o relatório de verificação não apresentar diferenças.

## Arquivos principais

- `001_core.sql`: schema operacional inicial.
- `002_align_store_members.sql`: compatibilidade com a primeira versão do schema.
- `lib/database/mysql.ts`: pool de conexões.
- `lib/data/mysql-operational-repository.ts`: consultas operacionais MySQL.
- `scripts/migrate-supabase-to-mysql.mjs`: cópia inicial.
- `scripts/verify-mysql-migration.mjs`: comparação de contagens.
- `scripts/test-mysql-schema.mjs`: smoke test independente.
