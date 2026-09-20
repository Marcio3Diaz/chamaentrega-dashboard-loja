# Carteira pré-paga / Pix

A carteira da loja usa saldo pré-pago com reserva automática da taxa de entrega.

## Secrets das Edge Functions

Configure no projeto Supabase:

- `WOOVI_APP_ID`: AppID da API Woovi/OpenPix.
- `WOOVI_WEBHOOK_SECRET`: HMAC secret configurada no webhook da Woovi.

## Webhook

Aponte o evento `OPENPIX:CHARGE_COMPLETED` para:

`https://zmwkigzuhizjujsrhlae.supabase.co/functions/v1/wallet-topup-webhook`

A recarga só é creditada após validação da assinatura do webhook.

## Fluxo financeiro

1. A loja adiciona saldo via Pix.
2. Ao publicar uma entrega em `available`, a taxa fica em `reserved_balance`.
3. Em `completed`, a reserva é capturada e vira um débito `delivery_payment`.
4. Em `cancelled` ou `expired`, a reserva é liberada.
5. Sem saldo disponível suficiente, a entrega não é publicada.
