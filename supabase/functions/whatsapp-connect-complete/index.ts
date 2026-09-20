import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function json(body: unknown,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
    },
  });
}

function env(name:string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function parseInjected(name:string) {
  const raw=env(name);
  if (!raw) return "";
  const parsed=JSON.parse(raw) as Record<string,string>;
  return parsed.default ?? Object.values(parsed)[0] ?? "";
}

function publicKey() {
  return env("SUPABASE_ANON_KEY") || parseInjected("SUPABASE_PUBLISHABLE_KEYS");
}

function adminKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || parseInjected("SUPABASE_SECRET_KEYS");
}

function numericId(value:unknown) {
  const text=String(value ?? "").trim();
  return /^\d{5,40}$/.test(text) ? text : "";
}

async function graphJson(
  url:string,
  init:RequestInit,
) {
  const response=await fetch(url,init);
  const data=await response.json().catch(()=>({})) as Record<string,unknown>;
  if (!response.ok) {
    const graphError=(data.error ?? {}) as Record<string,unknown>;
    throw new Error(String(graphError.message ?? `Meta HTTP ${response.status}`));
  }
  return data;
}

Deno.serve(async (request:Request) => {
  if (request.method !== "POST") return json({ error:"method_not_allowed" },405);

  const authorization=request.headers.get("authorization") ?? "";
  const supabaseUrl=env("SUPABASE_URL");
  const pub=publicKey();
  const secret=adminKey();

  if (!authorization || !supabaseUrl || !pub || !secret) {
    return json({ error:"unauthorized" },401);
  }

  const userClient=createClient(supabaseUrl,pub,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const admin=createClient(supabaseUrl,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });

  const { data:{user},error:userError }=await userClient.auth.getUser();
  if (userError || !user) return json({ error:"unauthorized" },401);

  let body:{
    store_id?:string;
    code?:string;
    waba_id?:string;
    phone_number_id?:string;
  }={};
  try { body=await request.json(); } catch {
    return json({ error:"invalid_json" },400);
  }

  const storeId=String(body.store_id ?? "").trim();
  const code=String(body.code ?? "").trim();
  const wabaId=numericId(body.waba_id);
  const phoneNumberId=numericId(body.phone_number_id);

  if (!storeId || !code || !wabaId || !phoneNumberId) {
    return json({ error:"invalid_signup_payload" },400);
  }

  const { data:store,error:storeError }=await userClient
    .from("stores")
    .select("id,name")
    .eq("id",storeId)
    .maybeSingle();

  if (storeError || !store) return json({ error:"store_not_allowed" },403);

  const appId=env("META_WHATSAPP_APP_ID");
  const appSecret=env("META_WHATSAPP_APP_SECRET");
  const version=env("META_GRAPH_API_VERSION") || "v26.0";
  const redirectUri=env("META_WHATSAPP_REDIRECT_URI");

  if (!appId || !appSecret) {
    return json({ error:"platform_not_configured" },503);
  }

  try {
    const tokenParams=new URLSearchParams({
      client_id:appId,
      client_secret:appSecret,
      code,
    });
    if (redirectUri) tokenParams.set("redirect_uri",redirectUri);

    const tokenData=await graphJson(
      `https://graph.facebook.com/${version}/oauth/access_token`,
      {
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:tokenParams,
      },
    );

    const accessToken=String(tokenData.access_token ?? "");
    if (!accessToken) throw new Error("A Meta não retornou um token de acesso.");

    const numbersData=await graphJson(
      `https://graph.facebook.com/${version}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers:{Authorization:`Bearer ${accessToken}`} },
    );

    const numbers=Array.isArray(numbersData.data) ? numbersData.data as Array<Record<string,unknown>> : [];
    const phone=numbers.find(item=>String(item.id ?? "")===phoneNumberId);
    if (!phone) throw new Error("O número autorizado não pertence à conta WhatsApp selecionada.");

    await graphJson(
      `https://graph.facebook.com/${version}/${wabaId}/subscribed_apps`,
      {
        method:"POST",
        headers:{Authorization:`Bearer ${accessToken}`},
      },
    );

    const expiresIn=Number(tokenData.expires_in);
    const tokenExpiresAt=Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now()+expiresIn*1000).toISOString()
      : null;

    const { error:credentialError }=await admin
      .from("whatsapp_connection_credentials")
      .upsert({
        store_id:storeId,
        waba_id:wabaId,
        phone_number_id:phoneNumberId,
        display_phone_number:String(phone.display_phone_number ?? "") || null,
        verified_name:String(phone.verified_name ?? "") || null,
        access_token:accessToken,
        token_type:String(tokenData.token_type ?? "") || null,
        token_expires_at:tokenExpiresAt,
        connected_at:new Date().toISOString(),
      },{onConflict:"store_id"});

    if (credentialError) {
      throw new Error(`Falha ao guardar credencial segura: ${credentialError.message}`);
    }

    const { data:existing }=await admin
      .from("store_integrations")
      .select("public_config")
      .eq("store_id",storeId)
      .eq("provider","whatsapp")
      .maybeSingle();

    const currentConfig=
      existing?.public_config &&
      typeof existing.public_config==="object" &&
      !Array.isArray(existing.public_config)
        ? existing.public_config as Record<string,unknown>
        : {};

    const { error:integrationError }=await admin
      .from("store_integrations")
      .upsert({
        store_id:storeId,
        provider:"whatsapp",
        status:"connected",
        is_enabled:true,
        public_config:{
          auto_import:currentConfig.auto_import !== false,
          waba_id:wabaId,
          phone_number_id:phoneNumberId,
          phone:String(phone.display_phone_number ?? ""),
          verified_name:String(phone.verified_name ?? ""),
          connection_method:"embedded_signup",
        },
        last_error:null,
      },{onConflict:"store_id,provider"});

    if (integrationError) {
      await admin.from("whatsapp_connection_credentials").delete().eq("store_id",storeId);
      throw new Error(`Falha ao ativar integração: ${integrationError.message}`);
    }

    return json({
      connected:true,
      phone_number_id:phoneNumberId,
      display_phone_number:String(phone.display_phone_number ?? ""),
      verified_name:String(phone.verified_name ?? ""),
    });
  } catch (error) {
    const message=error instanceof Error ? error.message : String(error);

    await admin
      .from("store_integrations")
      .upsert({
        store_id:storeId,
        provider:"whatsapp",
        status:"error",
        is_enabled:false,
        public_config:{auto_import:false},
        last_error:message.slice(0,500),
      },{onConflict:"store_id,provider"});

    console.error("whatsapp-connect-complete:",message);
    return json({ error:"meta_connection_failed",message },502);
  }
});
