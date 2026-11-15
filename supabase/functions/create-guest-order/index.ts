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

function nameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0] || "Customer",
    last_name: parts.slice(1).join(" ") || "Customer",
  };
}

async function startPaymobCheckout(
  order: Record<string, unknown>,
  lineItems: Array<Record<string, unknown>>,
  customer: { name: string; email: string; phone: string },
  address: Record<string, unknown>,
  storeSlug: string,
): Promise<string> {
  const secretKey = Deno.env.get("PAYMOB_SECRET_KEY");
  const publicKey = Deno.env.get("PAYMOB_PUBLIC_KEY");
  const integrationIdRaw = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";
  const publicOrigin = Deno.env.get("SULY_PUBLIC_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!secretKey || !publicKey || !/^\d+$/.test(integrationIdRaw) || !publicOrigin || !supabaseUrl) {
    throw new Error("Paymob is not configured.");
  }

  const origin = publicOrigin.replace(/\/$/, "");
  if (!origin.startsWith("https://")) throw new Error("SULY_PUBLIC_URL must use HTTPS.");

  const amountCents = Math.round(Number(order.total) * 100);
  const itemsAmount = lineItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || itemsAmount !== amountCents) {
    throw new Error("The Paymob items total does not match the order total.");
  }

  const customerName = nameParts(customer.name);
  const phone = customer.phone;
  const street = String(address.address ?? "").slice(0, 250);
  const city = String(address.city ?? "").slice(0, 100);
  const state = String(address.governorate ?? city).slice(0, 100);
  const postalCode = String(address.postal_code ?? "NA").slice(0, 20) || "NA";

  const payload = {
    amount: amountCents,
    currency: String(order.currency),
    payment_methods: [Number(integrationIdRaw)],
    items: lineItems.map(item => ({
      name: String(item.name).slice(0, 120),
      amount: Number(item.amount),
      quantity: Number(item.quantity),
      description: String(item.description ?? item.name).slice(0, 250),
    })),
    billing_data: {
      ...customerName,
      email: customer.email,
      phone_number: phone,
      street,
      building: "NA",
      floor: "NA",
      apartment: "NA",
      city,
      country: "EGY",
      state,
      postal_code: postalCode,
      extra_description: "Suly Plus online order",
    },
    special_reference: String(order.order_id),
    expiration: 3600,
    notification_url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/paymob-webhook`,
    redirection_url: `${origin}/store/${encodeURIComponent(storeSlug)}/order/${order.order_number}?token=${encodeURIComponent(String(order.public_token))}`,
    extras: {
      suly_order_id: String(order.order_id),
      store_slug: storeSlug,
    },
  };

  const apiResponse = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: {
      Authorization: `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const apiData = await apiResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!apiResponse.ok) {
    throw new Error(`Paymob intention request failed with HTTP ${apiResponse.status}.`);
  }

  const clientSecret = typeof apiData.client_secret === "string" ? apiData.client_secret : "";
  const intentionId = typeof apiData.id === "string" || typeof apiData.id === "number" ? String(apiData.id) : "";
  const intentionOrderId = typeof apiData.intention_order_id === "string" || typeof apiData.intention_order_id === "number"
    ? String(apiData.intention_order_id) : "";
  if (!clientSecret || !intentionId || !intentionOrderId) {
    throw new Error("Paymob returned an incomplete intention response.");
  }

  const checkoutUrl = new URL("https://accept.paymob.com/unifiedcheckout/");
  checkoutUrl.searchParams.set("publicKey", publicKey);
  checkoutUrl.searchParams.set("clientSecret", clientSecret);

  const admin = getAdminClient();
  const { data: attached, error: attachError } = await admin.rpc("attach_paymob_intention_v2", {
    p_order_id: String(order.order_id),
    p_intention_id: intentionId,
    p_intention_order_id: intentionOrderId,
    p_checkout_url: checkoutUrl.toString(),
  });
  if (attachError || attached !== true) {
    throw new Error("Could not attach the Paymob intention to the order.");
  }

  return checkoutUrl.toString();
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
  if (paymentMethod !== "cash_on_delivery" && paymentMethod !== "paymob") {
    return response(400, { error: "طريقة الدفع غير مدعومة." });
  }

  if (paymentMethod === "paymob") {
    const integration = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";
    if (!Deno.env.get("PAYMOB_SECRET_KEY") || !Deno.env.get("PAYMOB_PUBLIC_KEY")
        || !Deno.env.get("PAYMOB_HMAC_SECRET") || !Deno.env.get("SULY_PUBLIC_URL")
        || !/^\d+$/.test(integration)) {
      return response(503, { error: "الدفع الإلكتروني غير مهيأ لهذا المتجر بعد. استخدم الدفع عند الاستلام أو تواصل مع المتجر." });
    }
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

  try {
    const admin = getAdminClient();
    const { data: allowed, error: rateError } = await admin.rpc("consume_checkout_rate_limit", {
      p_ip_address: clientIp(req),
    });
    if (rateError) return response(503, { error: "تعذر التحقق من حماية الطلبات. حاول مرة أخرى." });
    if (allowed !== true) return response(429, { error: "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى." });

    const { data: order, error } = await admin.rpc("create_guest_order_for_payment", {
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
      p_payment_method: paymentMethod,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("Insufficient stock")) return response(409, { error: "الكمية المطلوبة غير متاحة حاليًا." });
      if (message.includes("Store not found")) return response(404, { error: "المتجر غير موجود أو غير متاح." });
      if (message.includes("Product unavailable")) return response(409, { error: "أحد المنتجات لم يعد متاحًا." });
      return response(400, { error: "تعذر إنشاء الطلب. راجع بيانات السلة والعنوان وحاول مجددًا." });
    }
    if (!order || typeof order !== "object") return response(500, { error: "تعذر إنشاء الطلب." });

    if (paymentMethod === "cash_on_delivery") {
      const { line_items: _privateItems, ...safeOrder } = order as Record<string, unknown>;
      return response(201, { ok: true, order: safeOrder });
    }

    try {
      const checkoutUrl = await startPaymobCheckout(
        order as Record<string, unknown>,
        Array.isArray((order as Record<string, unknown>).line_items)
          ? (order as Record<string, unknown>).line_items as Array<Record<string, unknown>> : [],
        { name: customerName, email: customerEmail, phone: normalizedPhone },
        {
          address: shippingAddress.address,
          city: shippingAddress.city,
          governorate: shippingAddress.governorate,
          postal_code: shippingAddress.postal_code,
        },
        storeSlug,
      );
      const { line_items: _privateItems, ...safeOrder } = order as Record<string, unknown>;
      return response(201, { ok: true, order: safeOrder, checkout_url: checkoutUrl });
    } catch {
      await admin.rpc("fail_paymob_order", {
        p_order_id: String((order as Record<string, unknown>).order_id),
        p_error: "Paymob intention creation failed",
      });
      return response(502, { error: "تعذر بدء الدفع الإلكتروني. لم يتم تحصيل أي مبلغ، وتم إلغاء حجز الطلب. حاول مرة أخرى." });
    }
  } catch {
    return response(500, { error: "حدث خطأ داخلي أثناء إنشاء الطلب." });
  }
});
