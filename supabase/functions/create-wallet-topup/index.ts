import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const wooviAppId = Deno.env.get("WOOVI_APP_ID");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Configuração interna do Supabase ausente." }, 500);
  }
  if (!wooviAppId) {
    return json({ error: "A integração Pix ainda não tem WOOVI_APP_ID configurado no Supabase." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Usuário não autenticado." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

  const body = await req.json().catch(() => ({}));
  const storeId = String(body?.storeId ?? "");
  const amount = Number(body?.amount);
  if (!storeId || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Loja e valor de recarga são obrigatórios." }, 400);
  }

  const normalizedAmount = Math.round(amount * 100) / 100;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

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

  const correlationId = `wallet-topup:${storeId}:${crypto.randomUUID()}`;
  const cents = Math.round(normalizedAmount * 100);

  const { data: topup, error: topupError } = await admin
    .from("store_wallet_topups")
    .insert({
      wallet_id: wallet.id,
      store_id: storeId,
      provider: "woovi",
      correlation_id: correlationId,
      amount: normalizedAmount,
      status: "pending",
    })
    .select("id")
    .single();
  if (topupError || !topup) return json({ error: "Não foi possível iniciar a recarga." }, 500);

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
  });

  const providerData = await chargeResponse.json().catch(() => ({}));
  const charge = providerData?.charge ?? providerData;

  if (!chargeResponse.ok || !charge) {
    await admin.from("store_wallet_topups").update({
      status: "failed",
      provider_payload: providerData ?? {},
      updated_at: new Date().toISOString(),
    }).eq("id", topup.id);
    return json({ error: providerData?.error ?? providerData?.message ?? "A Woovi não conseguiu criar a cobrança Pix." }, 502);
  }

  const providerChargeId = charge.globalID ?? charge.identifier ?? charge.transactionID ?? null;
  const brCode = charge.brCode ?? charge.brCodeString ?? null;
  const qrCodeImageUrl = charge.qrCodeImage ?? charge.qrCodeImageUrl ?? null;
  const paymentLinkUrl = charge.paymentLinkUrl ?? charge.paymentLink ?? null;
  const expiresAt = charge.expiresDate ?? null;

  await admin.from("store_wallet_topups").update({
    provider_charge_id: providerChargeId,
    br_code: brCode,
    qr_code_image_url: qrCodeImageUrl,
    payment_link_url: paymentLinkUrl,
    provider_payload: providerData ?? {},
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", topup.id);

  return json({
    topupId: topup.id,
    correlationId,
    amount: normalizedAmount,
    brCode,
    qrCodeImageUrl,
    paymentLinkUrl,
    expiresAt,
    status: "pending",
  });
});
