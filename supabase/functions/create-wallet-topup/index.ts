import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const MAX_REQUEST_BYTES = 8 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const firstEnvKey = (legacyName: string, modernName: string) => {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;

  const raw = Deno.env.get(modernName);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.default ?? Object.values(parsed ?? {})[0] ?? null;
  } catch {
    return null;
  }
};

const ensureWalletWebhook = async (supabaseUrl: string, wooviAppId: string) => {
  const webhookUrl = `${supabaseUrl}/functions/v1/wallet-topup-webhook`;
  const headers = {
    Authorization: wooviAppId,
    Accept: "application/json",
  };

  const listResponse = await fetch(
    `https://api.woovi.com/api/v1/webhook?url=${encodeURIComponent(webhookUrl)}`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );

  if (listResponse.ok) {
    const listData = await listResponse.json().catch(() => ({}));
    const webhooks = Array.isArray(listData)
      ? listData
      : Array.isArray(listData?.webhooks)
        ? listData.webhooks
        : Array.isArray(listData?.data)
          ? listData.data
          : [];

    const exists = webhooks.some((item: any) => {
      const webhook = item?.webhook ?? item;
      return webhook?.url === webhookUrl &&
        webhook?.event === "OPENPIX:CHARGE_COMPLETED" &&
        webhook?.isActive !== false;
    });

    if (exists) return;
  }

  const createResponse = await fetch(
    "https://api.woovi.com/api/v1/webhook?validate=false",
    {
      method: "POST",
      headers: {
        Authorization: wooviAppId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        webhook: {
          name: "ChamaEntrega - recarga da carteira",
          event: "OPENPIX:CHARGE_COMPLETED",
          url: webhookUrl,
          isActive: true,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (createResponse.ok) return;

  const createData = await createResponse.json().catch(() => ({}));
  const message = String(
    createData?.error ??
    createData?.message ??
    createData?.errors?.[0]?.message ??
    "",
  );

  if (/already|duplicate|duplicad|unique|existe/i.test(message)) return;

  throw new Error(message || "Não foi possível registrar o webhook Pix.");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const userKey = firstEnvKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const adminKey = firstEnvKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  const wooviAppId = Deno.env.get("WOOVI_APP_ID");

  if (!supabaseUrl || !userKey || !adminKey) {
    console.error("wallet topup: configuração interna do Supabase ausente");
    return json({ error: "Serviço temporariamente indisponível." }, 500);
  }
  if (!wooviAppId) {
    console.error("wallet topup: integração Pix não configurada");
    return json({ error: "Integração Pix temporariamente indisponível." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Usuário não autenticado." }, 401);

  const userClient = createClient(supabaseUrl, userKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Requisição muito grande." }, 413);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "Requisição muito grande." }, 413);
  }

  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }

  const storeId = String(body?.storeId ?? "");
  const amount = Number(body?.amount);

  if (!storeId || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Loja e valor de recarga são obrigatórios." }, 400);
  }

  const normalizedAmount = Math.round(amount * 100) / 100;
  if (normalizedAmount < 1 || normalizedAmount > 5000) {
    return json({ error: "A recarga deve ficar entre R$ 1,00 e R$ 5.000,00." }, 400);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false },
  });

  const { data: store } = await admin
    .from("stores")
    .select("id,name,owner_id")
    .eq("id", storeId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();

  if (!store) return json({ error: "Loja não encontrada." }, 403);

  const { data: wallet } = await admin
    .from("store_wallets")
    .select("id")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!wallet) return json({ error: "Carteira não encontrada." }, 400);

  try {
    await ensureWalletWebhook(supabaseUrl, wooviAppId);
  } catch (error) {
    // A criação do Pix não deve ficar bloqueada por uma falha temporária
    // no cadastro/consulta do webhook. Registramos o erro e seguimos.
    console.warn(
      "wallet webhook setup warning",
      error instanceof Error ? error.message.slice(0, 500) : "verification_setup_failed",
    );
  }

  const correlationId = `wallet-topup:${storeId}:${crypto.randomUUID()}`;
  const cents = Math.round(normalizedAmount * 100);

  const { data: reservedTopupId, error: reserveError } = await admin.rpc(
    "reserve_store_wallet_topup",
    {
      p_store_id: storeId,
      p_wallet_id: wallet.id,
      p_correlation_id: correlationId,
      p_amount: normalizedAmount,
    },
  );

  if (reserveError) {
    if (reserveError.message?.includes("TOPUP_RATE_LIMITED")) {
      return json({
        error: "Muitas tentativas de recarga. Aguarde um minuto e tente novamente.",
      }, 429);
    }

    return json({ error: "Não foi possível iniciar a recarga." }, 500);
  }

  const topupId = String(reservedTopupId ?? "");
  if (!topupId) {
    return json({ error: "Não foi possível iniciar a recarga." }, 500);
  }

  const chargeResponse = await fetch("https://api.woovi.com/api/v1/charge", {
    method: "POST",
    headers: {
      Authorization: wooviAppId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      correlationID: correlationId,
      value: cents,
      comment: `Recarga carteira ChamaEntrega - ${store.name}`,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const providerData = await chargeResponse.json().catch(() => ({}));
  const charge = providerData?.charge ?? providerData;

  if (!chargeResponse.ok || !charge) {
    await admin
      .from("store_wallet_topups")
      .update({
        status: "failed",
        provider_payload: providerData ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", topupId);

    console.error(
      "wallet topup: provedor recusou criação da cobrança",
      { status: chargeResponse.status, topup_id: topupId },
    );

    return json({
      error: "Não foi possível criar a cobrança Pix agora. Tente novamente em instantes.",
    }, 502);
  }

  const providerChargeId =
    charge.globalID ?? charge.identifier ?? charge.transactionID ?? null;
  const brCode = charge.brCode ?? charge.brCodeString ?? providerData?.brCode ?? null;
  const qrCodeImageUrl = charge.qrCodeImage ?? charge.qrCodeImageUrl ?? null;
  const paymentLinkUrl = charge.paymentLinkUrl ?? charge.paymentLink ?? null;
  const expiresAt = charge.expiresDate ?? null;

  await admin
    .from("store_wallet_topups")
    .update({
      provider_charge_id: providerChargeId,
      br_code: brCode,
      qr_code_image_url: qrCodeImageUrl,
      payment_link_url: paymentLinkUrl,
      provider_payload: providerData ?? {},
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", topupId);

  return json({
    topupId: topupId,
    correlationId,
    amount: normalizedAmount,
    brCode,
    qrCodeImageUrl,
    paymentLinkUrl,
    expiresAt,
    status: "pending",
  });
});
