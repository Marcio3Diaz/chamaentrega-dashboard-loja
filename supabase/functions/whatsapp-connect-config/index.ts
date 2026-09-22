import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}

function publicKey() {
  const legacy = env("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const raw = env("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return "";
  const parsed = JSON.parse(raw) as Record<string,string>;
  return parsed.default ?? Object.values(parsed)[0] ?? "";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error:"method_not_allowed" },405);

  const authorization = request.headers.get("authorization") ?? "";
  const supabaseUrl = env("SUPABASE_URL");
  const key = publicKey();

  if (!authorization || !supabaseUrl || !key) {
    return json({ error:"unauthorized" },401);
  }

  const userClient = createClient(supabaseUrl,key,{
    global:{ headers:{ Authorization:authorization } },
    auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false },
  });

  const { data:{ user },error:userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error:"unauthorized" },401);

  let body:{ store_id?:string } = {};
  try { body = await request.json(); } catch {}

  const storeId = body.store_id?.trim() ?? "";
  if (!storeId) return json({ error:"store_required" },400);

  const { data:store,error:storeError } = await userClient
    .from("stores")
    .select("id")
    .eq("id",storeId)
    .maybeSingle();

  if (storeError || !store) return json({ error:"store_not_allowed" },403);

  const appId = env("META_WHATSAPP_APP_ID");
  const configId = env("META_WHATSAPP_CONFIG_ID");
  const appSecret = env("META_WHATSAPP_APP_SECRET");
  const verifyToken = env("WHATSAPP_VERIFY_TOKEN");
  const graphApiVersion = env("META_GRAPH_API_VERSION") || "v26.0";
  const featureType = env("META_WHATSAPP_FEATURE_TYPE");

  const ready = Boolean(appId && configId && appSecret && verifyToken);

  return json({
    ready,
    app_id: ready ? appId : null,
    config_id: ready ? configId : null,
    graph_api_version: graphApiVersion,
    feature_type: ready && featureType ? featureType : null,
  });
});
