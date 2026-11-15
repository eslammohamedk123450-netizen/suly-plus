import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) {
    return reply(401, { error: "Authentication required." });
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 4_096) return reply(413, { error: "Request is too large." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid JSON request." });
  }

  const storeId = typeof body.store_id === "string" ? body.store_id : "";
  const isActive = body.is_active;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)
      || typeof isActive !== "boolean" || reason.length > 500) {
    return reply(400, { error: "Invalid store status request." });
  }
  if (!isActive && reason.length < 5) {
    return reply(422, { error: "اكتب سببًا واضحًا لإيقاف المتجر (5 أحرف على الأقل)." });
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply(401, { error: "Invalid session." });

    // Platform privileges must come from trusted, server-managed app_metadata.
    if (authData.user.app_metadata?.role !== "platform_admin") {
      return reply(403, { error: "Platform administrator access required." });
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc("platform_admin_set_store_status", {
      p_actor_id: authData.user.id,
      p_store_id: storeId,
      p_is_active: isActive,
      p_reason: reason || null,
    });
    if (error) {
      if (error.message.includes("Store not found")) return reply(404, { error: "Store not found." });
      if (error.message.includes("Reason must")) return reply(400, { error: "Invalid reason." });
      return reply(400, { error: "تعذر تنفيذ الإجراء الإداري." });
    }
    return reply(200, { ok: true, result: data });
  } catch {
    return reply(500, { error: "Unexpected platform admin error." });
  }
});
