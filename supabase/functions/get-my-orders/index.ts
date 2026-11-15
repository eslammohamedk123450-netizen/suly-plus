import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
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
  if (!authorization || !url || !anonKey || !serviceKey) {
    return reply(401, { error: "Authentication required." });
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply(401, { error: "Invalid session." });

    const verifiedEmail = authData.user.email_confirmed_at
      ? authData.user.email?.trim().toLowerCase()
      : null;
    if (!verifiedEmail) {
      return reply(403, { error: "أكد بريدك الإلكتروني أولًا لعرض الطلبات المرتبطة به." });
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.rpc("get_customer_orders_by_email", {
      p_email: verifiedEmail,
      p_limit: 50,
    });
    if (error) return reply(503, { error: "تعذر تحميل سجل الطلبات. حاول مرة أخرى." });

    return reply(200, {
      ok: true,
      verified_email: verifiedEmail,
      orders: Array.isArray(data) ? data : [],
      limit: 50,
    });
  } catch {
    return reply(500, { error: "Unexpected customer order history error." });
  }
});
