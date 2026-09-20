import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const base64 = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("WOOVI_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    return new Response("webhook not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const received = req.headers.get("x-openpix-signature") ?? "";
  if (!received) return new Response("missing signature", { status: 401 });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  if (!safeEqual(base64(signed), received)) return new Response("invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);
  if (payload?.event !== "OPENPIX:CHARGE_COMPLETED") return new Response("ignored", { status: 200 });

  const charge = payload?.charge;
  const correlationId = String(charge?.correlationID ?? "");
  if (!correlationId.startsWith("wallet-topup:")) return new Response("ignored", { status: 200 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const providerChargeId = charge?.globalID ?? charge?.identifier ?? charge?.transactionID ?? null;

  const { error } = await admin.rpc("complete_store_wallet_topup", {
    p_correlation_id: correlationId,
    p_provider_charge_id: providerChargeId,
    p_provider_payload: payload,
  });

  if (error) {
    console.error("wallet topup completion failed", error);
    return new Response("processing failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
