import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function json(body:unknown,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
  });
}

function env(name:string) { return Deno.env.get(name)?.trim() ?? ""; }

function injected(name:string) {
  const raw=env(name);
  if (!raw) return "";
  const parsed=JSON.parse(raw) as Record<string,string>;
  return parsed.default ?? Object.values(parsed)[0] ?? "";
}

function pubKey() { return env("SUPABASE_ANON_KEY") || injected("SUPABASE_PUBLISHABLE_KEYS"); }
function secretKey() { return env("SUPABASE_SERVICE_ROLE_KEY") || injected("SUPABASE_SECRET_KEYS"); }

Deno.serve(async (request:Request) => {
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);

  const authorization=request.headers.get("authorization") ?? "";
  const url=env("SUPABASE_URL");
  const pub=pubKey();
  const secret=secretKey();
  if (!authorization || !url || !pub || !secret) return json({error:"unauthorized"},401);

  const userClient=createClient(url,pub,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const admin=createClient(url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });

  const {data:{user},error:userError}=await userClient.auth.getUser();
  if (userError || !user) return json({error:"unauthorized"},401);

  let body:{store_id?:string}={};
  try { body=await request.json(); } catch {}
  const storeId=String(body.store_id ?? "").trim();
  if (!storeId) return json({error:"store_required"},400);

  const {data:store,error:storeError}=await userClient
    .from("stores").select("id").eq("id",storeId).maybeSingle();
  if (storeError || !store) return json({error:"store_not_allowed"},403);

  const {data:credential}=await admin
    .from("whatsapp_connection_credentials")
    .select("waba_id,access_token")
    .eq("store_id",storeId)
    .maybeSingle();

  let metaUnsubscribed=false;
  if (credential?.waba_id && credential?.access_token) {
    const version=env("META_GRAPH_API_VERSION") || "v26.0";
    try {
      const response=await fetch(
        `https://graph.facebook.com/${version}/${credential.waba_id}/subscribed_apps`,
        {
          method:"DELETE",
          headers:{Authorization:`Bearer ${credential.access_token}`},
        },
      );
      metaUnsubscribed=response.ok;
    } catch {}
  }

  await admin.from("whatsapp_connection_credentials").delete().eq("store_id",storeId);

  const {error:updateError}=await admin
    .from("store_integrations")
    .upsert({
      store_id:storeId,
      provider:"whatsapp",
      status:"not_configured",
      is_enabled:false,
      public_config:{auto_import:false},
      last_error:null,
    },{onConflict:"store_id,provider"});

  if (updateError) return json({error:"disconnect_failed"},500);
  return json({disconnected:true,meta_unsubscribed:metaUnsubscribed});
});
