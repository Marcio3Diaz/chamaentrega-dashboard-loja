import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const WOOVI_PUBLIC_KEYS_URL = "https://api.woovi.com/api/v1/webhook/public-keys";
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKeys: CryptoKey[] = [];
let cachedKeysUntil = 0;

const fromBase64 = (value: string) => {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const pemToDer = (pem: string) => {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return fromBase64(base64).buffer;
};

const loadWooviPublicKeys = async () => {
  if (cachedKeys.length && Date.now() < cachedKeysUntil) return cachedKeys;

  try {
    const response = await fetch(WOOVI_PUBLIC_KEYS_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("public keys request failed");

    const data = await response.json();
    const entries = Array.isArray(data?.public_keys) ? data.public_keys : [];
    const imported: CryptoKey[] = [];

    for (const entry of entries) {
      if (!entry?.key) continue;
      imported.push(
        await crypto.subtle.importKey(
          "spki",
          pemToDer(String(entry.key)),
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        ),
      );
    }

    if (!imported.length) throw new Error("no public keys returned");

    cachedKeys = imported;
    cachedKeysUntil = Date.now() + 55 * 60 * 1000;
    return cachedKeys;
  } catch (error) {
    if (cachedKeys.length) return cachedKeys;
    throw error;
  }
};

const verifyRsaSignature = async (rawBody: Uint8Array<ArrayBuffer>, signature: string) => {
  const signatureBytes = fromBase64(signature);
  const keys = await loadWooviPublicKeys();

  for (const key of keys) {
    const valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      signatureBytes,
      rawBody,
    );
    if (valid) return true;
  }
  return false;
};

const verifyLegacyHmac = async (
  rawBody: Uint8Array<ArrayBuffer>,
  signature: string,
  secret: string,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64(signature),
    rawBody,
  );
};

const getAdminKey = () => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.default ?? Object.values(parsed ?? {})[0] ?? null;
  } catch {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    return new Response("webhook backend not configured", { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return new Response("payload too large", { status: 413 });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    return new Response("payload too large", { status: 413 });
  }
  const rsaSignature = req.headers.get("x-webhook-signature") ?? "";
  const hmacSignature = req.headers.get("x-openpix-signature") ?? "";
  const webhookSecret = Deno.env.get("WOOVI_WEBHOOK_SECRET") ?? "";

  let valid = false;

  try {
    if (rsaSignature) {
      valid = await verifyRsaSignature(rawBody, rsaSignature);
    } else if (hmacSignature && webhookSecret) {
      valid = await verifyLegacyHmac(rawBody, hmacSignature, webhookSecret);
    }
  } catch (error) {
    console.error("wallet webhook signature verification failed", error);
    return new Response("signature verification unavailable", { status: 503 });
  }

  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(decoder.decode(rawBody));
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (payload?.event !== "OPENPIX:CHARGE_COMPLETED") {
    return new Response("ignored", { status: 200 });
  }

  const charge = payload?.charge;
  const correlationId = String(charge?.correlationID ?? "");
  if (!correlationId.startsWith("wallet-topup:")) {
    return new Response("ignored", { status: 200 });
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false },
  });

  const providerChargeId =
    charge?.globalID ?? charge?.identifier ?? charge?.transactionID ?? null;

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
