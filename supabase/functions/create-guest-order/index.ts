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

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Server configuration is incomplete.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "Method not allowed." });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 32_000) return response(413, { error: "Checkout request is too large." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response(400, { error: "Invalid JSON request." });
  }

  const storeSlug = typeof body.store_slug === "string" ? body.store_slug.trim().toLowerCase() : "";
  const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
  const customerEmail = typeof body.customer_email === "string" ? body.customer_email.trim().toLowerCase() : "";
  const customerPhone = typeof body.customer_phone === "string" ? body.customer_phone.trim() : "";
  const address = body.shipping_address;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;
  const paymentMethod = typeof body.payment_method === "string" ? body.payment_method : "cash_on_delivery";
  const rawItems = body.items;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) || storeSlug.length > 100) {
    return response(400, { error: "اسم رابط المتجر غير صالح." });
  }
  if (customerName.length < 2 || customerName.length > 120) {
    return response(400, { error: "اكتب اسمًا صحيحًا." });
  }
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return response(400, { error: "البريد الإلكتروني غير صالح." });
  }
  const normalizedPhone = customerPhone.replace(/[^0-9+]/g, "");
  if (normalizedPhone.length < 8 || normalizedPhone.length > 20) {
    return response(400, { error: "رقم الهاتف غير صالح." });
  }
  if (!address || typeof address !== "object" || Array.isArray(address)) {
    return response(400, { error: "عنوان الشحن غير مكتمل." });
  }
  const shippingAddress = address as Record<string, unknown>;
  if (typeof shippingAddress.address !== "string" || shippingAddress.address.trim().length < 5
      || typeof shippingAddress.city !== "string" || shippingAddress.city.trim().length < 2) {
    return response(400, { error: "أدخل العنوان والمدينة بشكل صحيح." });
  }
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) {
    return response(400, { error: "السلة فارغة أو تحتوي على عدد غير مسموح من المنتجات." });
  }

  const aggregated = new Map<string, number>();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const item of rawItems) {
    if (!item || typeof item !== "object") return response(400, { error: "منتج غير صالح في السلة." });
    const line = item as Record<string, unknown>;
    if (typeof line.product_id !== "string" || !uuidPattern.test(line.product_id)
        || !Number.isInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 100) {
      return response(400, { error: "بيانات المنتج أو الكمية غير صالحة." });
    }
    const productId = line.product_id.toLowerCase();
    aggregated.set(productId, (aggregated.get(productId) ?? 0) + Number(line.quantity));
  }
  if ([...aggregated.values()].some(quantity => quantity > 100)) {
    return response(400, { error: "الكمية المطلوبة تتجاوز الحد المسموح." });
  }

  if (paymentMethod !== "cash_on_delivery") {
    return response(422, { error: "الدفع الإلكتروني غير مفعّل لهذا المتجر حتى يتم إعداد حساب بوابة الدفع." });
  }

  try {
    const admin = getAdminClient();
    const { data: allowed, error: rateError } = await admin.rpc("consume_checkout_rate_limit", {
      p_ip_address: clientIp(req),
    });
    if (rateError) {
      return response(503, { error: "تعذر التحقق من حماية الطلبات. حاول مرة أخرى." });
    }
    if (allowed !== true) {
      return response(429, { error: "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى." });
    }

    const { data: order, error } = await admin.rpc("create_guest_order", {
      p_store_slug: storeSlug,
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_customer_phone: normalizedPhone,
      p_shipping_address: {
        address: shippingAddress.address.trim().slice(0, 500),
        city: String(shippingAddress.city).trim().slice(0, 120),
        governorate: typeof shippingAddress.governorate === "string" ? shippingAddress.governorate.trim().slice(0, 120) : "",
        postal_code: typeof shippingAddress.postal_code === "string" ? shippingAddress.postal_code.trim().slice(0, 20) : "",
        country: "Egypt",
      },
      p_items: [...aggregated.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
      p_notes: notes,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("Insufficient stock")) return response(409, { error: "الكمية المطلوبة غير متاحة حاليًا." });
      if (message.includes("Store not found")) return response(404, { error: "المتجر غير موجود أو غير متاح." });
      if (message.includes("Product unavailable")) return response(409, { error: "أحد المنتجات لم يعد متاحًا." });
      return response(400, { error: "تعذر إنشاء الطلب. راجع بيانات السلة والعنوان وحاول مجددًا." });
    }

    return response(201, { ok: true, order });
  } catch {
    return response(500, { error: "حدث خطأ داخلي أثناء إنشاء الطلب." });
  }
});
