import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Json = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof createClient>;

const FUNCTION_NAME = "whatsapp-webhook";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-hub-signature-256",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function adminKey() {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const raw = env("SUPABASE_SECRET_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  }

  return "";
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function expectedSignature(rawBody: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  return `sha256=${toHex(signature)}`;
}

function messageBody(message: any): string {
  if (message?.type === "text") return text(message?.text?.body);
  if (message?.type === "button") return text(message?.button?.text);
  if (message?.type === "interactive") {
    return text(
      message?.interactive?.button_reply?.title ??
      message?.interactive?.list_reply?.title,
    );
  }
  if (message?.type === "location") {
    const lat = message?.location?.latitude;
    const lng = message?.location?.longitude;
    return lat != null && lng != null ? `Localização: ${lat}, ${lng}` : "";
  }
  if (message?.type === "order") return "Pedido enviado pelo catálogo do WhatsApp";
  return "";
}

function isLikelyOrder(body: string) {
  const value = body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  const intent = /\b(quero|gostaria|pedido|pedir|manda|mandar|me ve|vou querer|separa|separe)\b/.test(value);
  const quantity = /\b\d+\s*(x|un|unid|unidade|unidades)?\b/.test(value);
  const delivery = /\b(entrega|entregar|delivery|retirada|buscar)\b/.test(value);
  const explicitOrder = /\b(pedido|pedir|vou querer|me ve|separa|separe)\b/.test(value);

  return intent && (quantity || delivery || explicitOrder);
}

function messageReceivedAt(message: any) {
  const seconds = Number(message?.timestamp);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function activeOrderStatuses(status: string) {
  return ["new", "preparing", "ready"].includes(status);
}

function mergedMetadata(
  current: unknown,
  patch: Record<string, unknown>,
  messageId: string,
) {
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {};

  const existingIds = Array.isArray(base.whatsapp_message_ids)
    ? base.whatsapp_message_ids.map(String)
    : [];

  return {
    ...base,
    ...patch,
    whatsapp_message_ids: Array.from(new Set([...existingIds, messageId])),
  };
}

function appendNote(current: unknown, next: string) {
  const previous = text(current);
  if (!next) return previous || null;
  if (!previous) return next;
  if (previous.includes(next)) return previous;
  return `${previous}\nWhatsApp: ${next}`;
}

async function resolveIntegration(
  admin: SupabaseAdmin,
  phoneNumberId: string,
  displayPhone: string,
) {
  const { data, error } = await admin
    .from("store_integrations")
    .select("store_id,status,is_enabled,public_config")
    .eq("provider", "whatsapp")
    .eq("is_enabled", true);

  if (error) throw new Error(`Falha ao consultar integração WhatsApp: ${error.message}`);

  const displayDigits = digits(displayPhone);

  for (const row of data ?? []) {
    const config = (row.public_config ?? {}) as Record<string, unknown>;
    const configuredPhoneNumberId = text(config.phone_number_id);

    if (configuredPhoneNumberId && configuredPhoneNumberId === phoneNumberId) {
      return { ...row, config };
    }

    const configuredPhone = digits(config.phone);
    if (!configuredPhone || !displayDigits) continue;

    const exact = configuredPhone === displayDigits;
    const suffix =
      configuredPhone.length >= 10 &&
      displayDigits.length >= configuredPhone.length &&
      displayDigits.endsWith(configuredPhone);

    if (exact || suffix) return { ...row, config };
  }

  return null;
}

async function upsertConversation(
  admin: SupabaseAdmin,
  storeId: string,
  waId: string,
  customerName: string,
  receivedAt: string,
) {
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .upsert({
      store_id: storeId,
      wa_id: waId,
      customer_name: customerName || null,
      customer_phone: waId || null,
      status: "open",
      last_message_at: receivedAt,
    }, { onConflict: "store_id,wa_id" })
    .select("id,active_order_id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao atualizar conversa WhatsApp: ${error?.message ?? "sem retorno"}`);
  }

  return data;
}

async function insertMessage(
  admin: SupabaseAdmin,
  input: {
    storeId: string;
    conversationId: string;
    providerMessageId: string;
    waId: string;
    messageType: string;
    body: string;
    payload: Json;
    receivedAt: string;
  },
) {
  const { data, error } = await admin
    .from("whatsapp_messages")
    .insert({
      store_id: input.storeId,
      conversation_id: input.conversationId,
      provider_message_id: input.providerMessageId,
      wa_id: input.waId,
      message_type: input.messageType,
      body: input.body || null,
      provider_payload: input.payload,
      received_at: input.receivedAt,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") return { duplicate: true };
  if (error) throw new Error(`Falha ao salvar mensagem WhatsApp: ${error.message}`);

  return { duplicate: false, id: data?.id ?? null };
}

async function getActiveOrder(
  admin: SupabaseAdmin,
  storeId: string,
  orderId: string | null,
) {
  if (!orderId) return null;

  const { data, error } = await admin
    .from("store_orders")
    .select("id,status,customer_note,source_metadata,items,order_total")
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao consultar pedido WhatsApp: ${error.message}`);
  if (!data || !activeOrderStatuses(data.status)) return null;
  return data;
}

async function bindOrder(
  admin: SupabaseAdmin,
  conversationId: string,
  orderId: string,
) {
  const { error } = await admin
    .from("whatsapp_conversations")
    .update({ active_order_id: orderId })
    .eq("id", conversationId);

  if (error) throw new Error(`Falha ao vincular conversa ao pedido: ${error.message}`);
}

function structuredItems(message: any) {
  const rows = Array.isArray(message?.order?.product_items)
    ? message.order.product_items
    : [];

  return rows.map((item: any) => {
    const quantity = Math.max(1, Number(item?.quantity ?? 1));
    const unitPrice = Number(item?.item_price ?? 0);
    const retailerId = text(item?.product_retailer_id);

    return {
      name: retailerId ? `Produto ${retailerId}` : "Item do catálogo",
      product_retailer_id: retailerId || null,
      quantity,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    };
  });
}

async function processStructuredOrder(
  admin: SupabaseAdmin,
  storeId: string,
  conversation: any,
  waId: string,
  customerName: string,
  providerMessageId: string,
  message: any,
) {
  const items = structuredItems(message);
  const total = items.reduce(
    (sum: number, item: any) => sum + Number(item.unit_price ?? 0) * Number(item.quantity ?? 1),
    0,
  );

  const current = await getActiveOrder(
    admin,
    storeId,
    conversation.active_order_id ?? null,
  );

  const metadataPatch = {
    whatsapp_wa_id: waId,
    whatsapp_catalog_id: text(message?.order?.catalog_id) || null,
    classification: "structured_order",
    requires_review: false,
  };

  if (current) {
    const { error } = await admin
      .from("store_orders")
      .update({
        customer_name: customerName || null,
        customer_phone: waId || null,
        items,
        order_total: total,
        source_metadata: mergedMetadata(
          current.source_metadata,
          metadataPatch,
          providerMessageId,
        ),
      })
      .eq("id", current.id)
      .eq("store_id", storeId);

    if (error) throw new Error(`Falha ao atualizar pedido estruturado: ${error.message}`);
    return current.id;
  }

  const { data, error } = await admin
    .from("store_orders")
    .insert({
      store_id: storeId,
      source: "whatsapp",
      status: "new",
      fulfillment_type: "delivery",
      customer_name: customerName || null,
      customer_phone: waId || null,
      items,
      order_total: total,
      payment_method: "unknown",
      payment_status: "unknown",
      source_metadata: mergedMetadata({}, metadataPatch, providerMessageId),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao criar pedido estruturado: ${error?.message ?? "sem retorno"}`);
  }

  await bindOrder(admin, conversation.id, data.id);
  return data.id;
}

async function processTextCandidate(
  admin: SupabaseAdmin,
  storeId: string,
  conversation: any,
  waId: string,
  customerName: string,
  providerMessageId: string,
  body: string,
) {
  const current = await getActiveOrder(
    admin,
    storeId,
    conversation.active_order_id ?? null,
  );

  if (current) {
    const { error } = await admin
      .from("store_orders")
      .update({
        customer_name: customerName || null,
        customer_phone: waId || null,
        customer_note: appendNote(current.customer_note, body),
        source_metadata: mergedMetadata(
          current.source_metadata,
          { whatsapp_wa_id: waId, requires_review: true },
          providerMessageId,
        ),
      })
      .eq("id", current.id)
      .eq("store_id", storeId);

    if (error) throw new Error(`Falha ao anexar mensagem ao pedido: ${error.message}`);
    return current.id;
  }

  if (!isLikelyOrder(body)) return null;

  const { data, error } = await admin
    .from("store_orders")
    .insert({
      store_id: storeId,
      source: "whatsapp",
      status: "new",
      fulfillment_type: "delivery",
      customer_name: customerName || null,
      customer_phone: waId || null,
      items: [],
      order_total: 0,
      payment_method: "unknown",
      payment_status: "unknown",
      customer_note: body,
      source_metadata: mergedMetadata(
        {},
        {
          whatsapp_wa_id: waId,
          classification: "text_candidate",
          requires_review: true,
        },
        providerMessageId,
      ),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao criar candidato de pedido: ${error?.message ?? "sem retorno"}`);
  }

  await bindOrder(admin, conversation.id, data.id);
  return data.id;
}

async function processLocation(
  admin: SupabaseAdmin,
  storeId: string,
  conversation: any,
  providerMessageId: string,
  message: any,
) {
  const current = await getActiveOrder(
    admin,
    storeId,
    conversation.active_order_id ?? null,
  );
  if (!current) return null;

  const latitude = Number(message?.location?.latitude);
  const longitude = Number(message?.location?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const { error } = await admin
    .from("store_orders")
    .update({
      delivery_latitude: latitude,
      delivery_longitude: longitude,
      source_metadata: mergedMetadata(
        current.source_metadata,
        { whatsapp_location_received: true },
        providerMessageId,
      ),
    })
    .eq("id", current.id)
    .eq("store_id", storeId);

  if (error) throw new Error(`Falha ao anexar localização ao pedido: ${error.message}`);
  return current.id;
}

async function processMessage(
  admin: SupabaseAdmin,
  value: any,
  message: any,
) {
  const phoneNumberId = text(value?.metadata?.phone_number_id);
  const displayPhone = text(value?.metadata?.display_phone_number);
  const integration = await resolveIntegration(admin, phoneNumberId, displayPhone);

  if (!integration) {
    console.warn(
      `${FUNCTION_NAME}: nenhuma loja habilitada encontrada para o número ${displayPhone || phoneNumberId}.`,
    );
    return { skipped: "store_not_found" };
  }

  const storeId = text(integration.store_id);
  const config = integration.config as Record<string, unknown>;
  const autoImport = config.auto_import === true;

  const waId = text(message?.from);
  const providerMessageId = text(message?.id);
  if (!waId || !providerMessageId) return { skipped: "invalid_message" };

  const contact = Array.isArray(value?.contacts)
    ? value.contacts.find((item: any) => text(item?.wa_id) === waId) ?? value.contacts[0]
    : null;

  const customerName = text(contact?.profile?.name);
  const receivedAt = messageReceivedAt(message);
  const body = messageBody(message);

  const conversation = await upsertConversation(
    admin,
    storeId,
    waId,
    customerName,
    receivedAt,
  );

  const saved = await insertMessage(admin, {
    storeId,
    conversationId: conversation.id,
    providerMessageId,
    waId,
    messageType: text(message?.type) || "unknown",
    body,
    payload: {
      id: providerMessageId,
      from: waId,
      type: text(message?.type) || "unknown",
      timestamp: text(message?.timestamp),
      text: message?.text ?? null,
      order: message?.order ?? null,
      location: message?.location ?? null,
      interactive: message?.interactive ?? null,
      metadata: {
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhone,
      },
    },
    receivedAt,
  });

  if (saved.duplicate) return { duplicate: true };

  await admin
    .from("store_integrations")
    .update({
      status: "connected",
      last_synced_at: receivedAt,
      last_error: null,
    })
    .eq("store_id", storeId)
    .eq("provider", "whatsapp");

  if (!autoImport) return { saved: true, imported: false };

  let orderId: string | null = null;

  if (message?.type === "order") {
    orderId = await processStructuredOrder(
      admin,
      storeId,
      conversation,
      waId,
      customerName,
      providerMessageId,
      message,
    );
  } else if (message?.type === "location") {
    orderId = await processLocation(
      admin,
      storeId,
      conversation,
      providerMessageId,
      message,
    );
  } else if (body) {
    orderId = await processTextCandidate(
      admin,
      storeId,
      conversation,
      waId,
      customerName,
      providerMessageId,
      body,
    );
  }

  return { saved: true, imported: Boolean(orderId), order_id: orderId };
}

async function handleWebhookPayload(admin: SupabaseAdmin, payload: any) {
  let processed = 0;
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value || !Array.isArray(value.messages)) continue;

      for (const message of value.messages) {
        const result = await processMessage(admin, value, message);
        processed += 1;
        if (result?.imported) imported += 1;
        if (result?.duplicate) duplicates += 1;
        if (result?.skipped) skipped += 1;
      }
    }
  }

  return { processed, imported, duplicates, skipped };
}

Deno.serve(async (request: Request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode") ?? "";
      const token = url.searchParams.get("hub.verify_token") ?? "";
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      const verifyToken = env("WHATSAPP_VERIFY_TOKEN");

      if (!mode) {
        return json({
          ok: true,
          function: FUNCTION_NAME,
          configured: Boolean(verifyToken && env("WHATSAPP_APP_SECRET")),
        });
      }

      if (!verifyToken) return new Response("webhook not configured", { status: 503 });

      if (mode === "subscribe" && safeEqual(token, verifyToken)) {
        return new Response(challenge, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "content-type": "text/plain; charset=utf-8",
          },
        });
      }

      return new Response("forbidden", { status: 403 });
    }

    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const appSecret = env("WHATSAPP_APP_SECRET");
    const supabaseUrl = env("SUPABASE_URL");
    const key = adminKey();

    if (!appSecret || !supabaseUrl || !key) {
      return new Response("webhook not configured", { status: 503 });
    }

    const rawBody = await request.text();
    const receivedSignature = request.headers.get("x-hub-signature-256")?.trim() ?? "";

    if (!receivedSignature) {
      return new Response("missing signature", { status: 401 });
    }

    const expected = await expectedSignature(rawBody, appSecret);
    if (!safeEqual(receivedSignature, expected)) {
      return new Response("invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    if (payload?.object !== "whatsapp_business_account") {
      return json({ ok: true, skipped: true, reason: "unsupported_object" });
    }

    const admin = createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const result = await handleWebhookPayload(admin, payload);
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${FUNCTION_NAME}: ${message}`);
    return json({ error: "processing_failed" }, 500);
  }
});
