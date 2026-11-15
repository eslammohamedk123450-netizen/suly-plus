import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "Method not allowed." });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return response(400, { error: "Invalid JSON request." }); }

  const orderNumber = Number(body.order_number);
  const token = typeof body.public_token === "string" ? body.public_token : "";
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return response(400, { error: "رابط تتبع الطلب غير صالح." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return response(500, { error: "Server configuration is incomplete." });

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { data: allowed, error: rateError } = await admin.rpc("consume_checkout_rate_limit", {
    p_ip_address: `order-status:${ip}`,
  });
  if (rateError) return response(503, { error: "تعذر التحقق من الطلب حاليًا." });
  if (allowed !== true) return response(429, { error: "طلبات بحث كثيرة. حاول مرة أخرى لاحقًا." });

  const { data, error } = await admin.rpc("get_public_order", {
    p_order_number: orderNumber,
    p_public_token: token,
  });
  if (error) return response(503, { error: "تعذر تحميل حالة الطلب." });
  if (!data) return response(404, { error: "لم يتم العثور على الطلب." });

  return response(200, { ok: true, order: data });
});
