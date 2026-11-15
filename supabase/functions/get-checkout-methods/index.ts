import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-store-slug",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server configuration is incomplete.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function isPaymobIntegrationId(value: string): boolean { return /^\d+$/.test(value); }
function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}
function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return response(405, { error: "Method not allowed." });

  try {
    const admin = getAdminClient();
    if (req.method === "POST") {
      const length = Number(req.headers.get("content-length") ?? 0);
      if (length > 16_000) return response(413, { error: "Checkout quote request is too large." });
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return response(400, { error: "Invalid JSON request." }); }
      const storeSlug = typeof body.store_slug === "string" ? body.store_slug.trim().toLowerCase() : "";
      const items = body.items;
      const couponCode = typeof body.coupon_code === "string" ? body.coupon_code.trim().toUpperCase() : null;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) || storeSlug.length > 100) {
        return response(400, { error: "اسم رابط المتجر غير صالح." });
      }
      if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
        return response(400, { error: "السلة فارغة أو غير صالحة." });
      }
      if (couponCode && !/^[A-Z0-9_-]{3,40}$/.test(couponCode)) {
        return response(400, { error: "كود الخصم غير صالح." });
      }
      const normalizedItems: Array<{product_id:string;quantity:number}> = [];
      for (const row of items) {
        if (!row || typeof row !== "object") return response(400, { error: "عنصر غير صالح في السلة." });
        const line = row as Record<string, unknown>;
        if (typeof line.product_id !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(line.product_id)
          || !Number.isInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 100) {
          return response(400, { error: "بيانات المنتج أو الكمية غير صالحة." });
        }
        normalizedItems.push({ product_id: line.product_id.toLowerCase(), quantity: Number(line.quantity) });
      }
      const { data: allowed, error: rateError } = await admin.rpc("consume_checkout_quote_rate_limit", {
        p_ip_address: `checkout-quote:${clientIp(req)}`,
      });
      if (rateError) return response(503, { error: "تعذر التحقق من طلب التسعير. حاول مرة أخرى." });
      if (allowed !== true) return response(429, { error: "طلبات التسعير كثيرة. انتظر قليلًا ثم حاول مرة أخرى." });

      const { data, error } = await admin.rpc("get_guest_checkout_quote", {
        p_store_slug: storeSlug,
        p_items: normalizedItems,
        p_coupon_code: couponCode,
      });
      if (error) {
        const message = error.message ?? "";
        if (message.includes("Coupon unavailable")) return response(422, { error: "كود الخصم غير صالح أو منتهي أو لا ينطبق على قيمة السلة." });
        if (message.includes("Insufficient stock")) return response(409, { error: "الكمية المطلوبة غير متاحة حاليًا." });
        if (message.includes("Product unavailable")) return response(409, { error: "أحد المنتجات لم يعد متاحًا." });
        return response(400, { error: "تعذر حساب إجمالي السلة. حدّث الصفحة وحاول مرة أخرى." });
      }
      return response(200, { ok: true, quote: data });
    }

    const storeSlug = (req.headers.get("x-store-slug") ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) || storeSlug.length > 100) {
      return response(400, { error: "Store slug is required." });
    }
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id").eq("slug", storeSlug).eq("is_active", true).maybeSingle();
    if (storeError || !store) return response(404, { error: "Store not found." });

    const { data: settingsRow } = await admin.from("store_settings")
      .select("settings").eq("store_id", store.id).maybeSingle();
    const checkout = (settingsRow?.settings?.checkout_pricing ?? {}) as Record<string, unknown>;

    const integrationId = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";
    const enabledStoreSlug = (Deno.env.get("PAYMOB_ENABLED_STORE_SLUG") ?? "").trim().toLowerCase();
    const publicOrigin = Deno.env.get("SULY_PUBLIC_URL") ?? "";
    const paymobEnabled = Boolean(
      enabledStoreSlug && enabledStoreSlug === storeSlug
      && Deno.env.get("PAYMOB_SECRET_KEY") && Deno.env.get("PAYMOB_PUBLIC_KEY")
      && Deno.env.get("PAYMOB_HMAC_SECRET") && publicOrigin.startsWith("https://")
      && isPaymobIntegrationId(integrationId)
    );
    return response(200, {
      methods: { cash_on_delivery: true, paymob: paymobEnabled },
      pricing: {
        shipping_fee: amount(checkout.shipping_fee),
        free_shipping_threshold: amount(checkout.free_shipping_threshold),
        tax_rate: Math.min(100, amount(checkout.tax_rate)),
      },
    });
  } catch {
    return response(500, { error: "حدث خطأ داخلي أثناء تحميل إعدادات الدفع." });
  }
});
