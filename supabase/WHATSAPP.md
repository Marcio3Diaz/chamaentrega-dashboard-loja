# WhatsApp no ChamaEntrega — integração direta

## Experiência da loja

A loja não configura Supabase, webhook, App Secret, Verify Token ou Phone Number ID manualmente.

No dashboard ela usa apenas:

```text
Integrações → WhatsApp → Conectar WhatsApp
```

O botão abre o Embedded Signup oficial da Meta. A loja entra na Meta, escolhe a empresa, a conta do WhatsApp Business e o número. Ao concluir, o ChamaEntrega recebe os identificadores autorizados e conclui a conexão no servidor.

## Fluxo

```text
Loja
  ↓
Conectar WhatsApp
  ↓
Meta Embedded Signup
  ↓
authorization code + waba_id + phone_number_id
  ↓
/api/integrations/whatsapp/complete
  ↓
troca do código por token na Meta
  ↓
assinatura da WABA em /{WABA_ID}/subscribed_apps
  ↓
credencial privada no backend
  ↓
store_integrations = connected
  ↓
whatsapp-webhook
  ↓
Pedidos Integrados
```

## Variáveis internas da plataforma

Estas variáveis pertencem ao ChamaEntrega e são configuradas uma única vez pelo operador da plataforma. Nunca devem ser solicitadas às lojas clientes.

No ambiente do Next.js:

```text
META_WHATSAPP_APP_ID=
META_WHATSAPP_APP_SECRET=
META_WHATSAPP_CONFIG_ID=
META_GRAPH_API_VERSION=v26.0
META_WHATSAPP_REDIRECT_URI=
META_WHATSAPP_FEATURE_TYPE=
```

No ambiente da Edge Function `whatsapp-webhook`:

```text
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
```

## Rotas do dashboard

- `GET /api/integrations/whatsapp/config`: devolve ao browser somente App ID, Configuration ID e versão necessários para abrir o Embedded Signup. Nunca devolve App Secret.
- `POST /api/integrations/whatsapp/complete`: recebe o código temporário do Embedded Signup, troca por credencial na Meta no servidor, valida a WABA e o número, assina o app nos webhooks e grava a conexão.
- `POST /api/integrations/whatsapp/disconnect`: remove a conexão local e a credencial privada da loja.

## Armazenamento seguro

A tabela `whatsapp_connection_credentials` guarda a credencial de cada loja.

- RLS está habilitado;
- `anon` e `authenticated` não têm SELECT, INSERT, UPDATE ou DELETE;
- o navegador não recebe o token;
- as RPCs de gravação verificam `auth.uid()` e se a loja pertence ao usuário.

A tabela `store_integrations` recebe apenas dados não secretos, como:

- `waba_id`;
- `phone_number_id`;
- número formatado;
- nome verificado;
- preferência `auto_import`.

## Webhook

O webhook de mensagens permanece centralizado:

```text
https://zmwkigzuhizjujsrhlae.supabase.co/functions/v1/whatsapp-webhook
```

Ele identifica a loja pelo `phone_number_id` gravado automaticamente no Embedded Signup.

## Pedidos

Quando `auto_import=true`:

- pedidos estruturados do catálogo viram `store_orders`;
- mensagens de texto que parecem pedido entram como candidato para revisão;
- mensagens seguintes da mesma conversa são anexadas ao pedido ativo;
- localização enviada pelo cliente atualiza latitude/longitude;
- a página `/pedidos` recebe as alterações via Realtime.

## Requisitos da Meta para produção

O app do ChamaEntrega precisa estar configurado para Embedded Signup e, para onboarding público, precisa cumprir os requisitos da Meta para Tech Provider/App Review e permissões aplicáveis.
