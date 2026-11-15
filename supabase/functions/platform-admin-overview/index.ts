import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return reply(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return reply(401, { error: "Authentication required." });

  try {
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return reply(401, { error: "Invalid session." });

    // app_metadata is server-managed; user_metadata is user-editable and must never grant admin access.
    if (authData.user.app_metadata?.role !== "platform_admin") {
      return reply(403, { error: "Platform administrator access required." });
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const [stores, users, orders, recent] = await Promise.all([
      admin.from("stores").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("orders").select("id", { count: "exact", head: true }),
      admin.from("stores").select("id,name,slug,is_active,created_at").order("created_at", { ascending: false }).limit(5),
    ]);
    if (stores.error || users.error || orders.error || recent.error) {
      return reply(503, { error: "Platform metrics are temporarily unavailable." });
    }
    return reply(200, {
      ok: true,
      metrics: {
        stores_count: stores.count ?? 0,
        users_count: users.count ?? 0,
        orders_count: orders.count ?? 0,
      },
      recent_stores: recent.data ?? [],
    });
  } catch {
    return reply(500, { error: "Unexpected platform admin error." });
  }
});
