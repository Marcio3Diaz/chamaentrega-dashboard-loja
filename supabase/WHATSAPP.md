# Integração WhatsApp Business Platform — ChamaEntrega

## Endpoint

Callback URL:

```text
https://zmwkigzuhizjujsrhlae.supabase.co/functions/v1/whatsapp-webhook
```

A Edge Function está publicada com `verify_jwt = false` porque a Meta não envia JWT do Supabase. A segurança do POST é feita pela assinatura `x-hub-signature-256` usando o App Secret da Meta.

## Secrets obrigatórios

Configure no Supabase Edge Functions:

```text
WHATSAPP_VERIFY_TOKEN=<token escolhido para verificar o webhook>
WHATSAPP_APP_SECRET=<App Secret do app na Meta>
```

Não coloque esses valores em `.env.local` do Next.js e nunca use prefixo `NEXT_PUBLIC_`.

## Configuração na Meta

1. Crie ou abra um app do tipo Business no Meta for Developers.
2. Adicione o produto WhatsApp.
3. Em Webhooks do WhatsApp, informe o Callback URL acima.
4. Informe no campo Verify Token exatamente o mesmo valor configurado em `WHATSAPP_VERIFY_TOKEN`.
5. Assine pelo menos o campo `messages`.
6. Copie o `Phone Number ID` do número e salve no painel ChamaEntrega em Integrações > WhatsApp.
7. Salve o número comercial com DDI e DDD.
8. Ative “Importar pedidos automaticamente” se quiser criar candidatos em Pedidos Integrados.

## O que o backend faz

- valida o GET de verificação da Meta;
- valida a assinatura HMAC SHA-256 do POST;
- identifica a loja pelo `Phone Number ID` ou pelo número comercial;
- grava mensagens com deduplicação por `provider_message_id`;
- mantém uma conversa por loja + cliente;
- marca a integração como `connected` quando a primeira mensagem válida chegar;
- mensagens estruturadas do catálogo do WhatsApp viram pedidos com itens e valores;
- mensagens de texto que parecem pedido viram candidato em `store_orders` com `requires_review=true`;
- novas mensagens da mesma conversa são anexadas ao pedido ativo;
- mensagens de localização atualizam latitude/longitude do pedido ativo;
- todos os pedidos aparecem na rota `/pedidos` por Realtime.

## Segurança

As tabelas `whatsapp_messages` e `whatsapp_conversations` usam RLS. Usuários autenticados da loja têm somente leitura. Inserções são feitas exclusivamente pela Edge Function usando chave administrativa do Supabase.

O App Secret e o Verify Token não são armazenados no navegador nem em `store_integrations.public_config`.

## Limitações atuais

- texto livre usa classificação conservadora por regras e entra como “requer revisão”;
- nomes de produtos em pedidos estruturados usam o `product_retailer_id` enviado pelo catálogo até existir sincronização do catálogo;
- respostas automáticas pelo WhatsApp ainda não estão implementadas;
- o Access Token da WhatsApp Cloud API só será necessário quando o ChamaEntrega passar a enviar mensagens ativamente.
