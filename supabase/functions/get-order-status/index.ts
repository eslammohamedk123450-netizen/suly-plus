import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const INQUIRY_MIN_ORDER_AGE_MS = 2 * 60 * 1000;

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isPaymobIntegrationId(value: string): boolean {
  return /^\d+$/.test(value);
}

async function reconcilePendingPaymobOrder(
  admin: ReturnType<typeof createClient>,
  orderNumber: number,
  publicToken: string,
): Promise<void> {
  const apiKey = Deno.env.get("PAYMOB_API_KEY");
  const configuredIntegrationId = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";
  if (!apiKey || !isPaymobIntegrationId(configuredIntegrationId)) return;

  try {
    // The public token must match before any Paymob inquiry is attempted.
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,created_at,currency,total,payment_status,payment_method")
      .eq("order_number", orderNumber)
      .eq("public_token", publicToken)
      .maybeSingle();

    if (orderError || !order || order.payment_method !== "paymob" || order.payment_status !== "pending") return;

    const createdAt = Date.parse(String(order.created_at));
    if (!Number.isFinite(createdAt) || Date.now() - createdAt < INQUIRY_MIN_ORDER_AGE_MS) return;

    const { data: payment, error: paymentError } = await admin
      .from("payment_transactions")
      .select("amount,currency,status,metadata")
      .eq("order_id", order.id)
      .eq("provider", "paymob")
      .maybeSingle();

    if (paymentError || !payment || payment.status !== "pending") return;

    const metadata = payment.metadata && typeof payment.metadata === "object"
      ? payment.metadata as Record<string, unknown>
      : {};
    const intentionOrderId = typeof metadata.intention_order_id === "string"
      ? metadata.intention_order_id
      : String(metadata.intention_order_id ?? "");

    if (!/^\d+$/.test(intentionOrderId) || metadata.suly_order_id !== order.id) return;

    const authResponse = await fetch("https://accept.paymob.com/api/auth/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
      signal: AbortSignal.timeout(8_000),
    });
    const authData = await authResponse.json().catch(() => null) as Record<string, unknown> | null;
    const authToken = typeof authData?.token === "string" ? authData.token : "";
    if (!authResponse.ok || !authToken) return;

    const inquiryResponse = await fetch("https://accept.paymob.com/api/ecommerce/orders/transaction_inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth_token: authToken, order_id: intentionOrderId }),
      signal: AbortSignal.timeout(8_000),
    });
    const inquiry = await inquiryResponse.json().catch(() => null) as Record<string, unknown> | null;
    if (!inquiryResponse.ok || !inquiry || !inquiry.order || typeof inquiry.order !== "object") return;

    const paymobOrder = inquiry.order as Record<string, unknown>;
    const transactionId = String(inquiry.id ?? "");
    const returnedOrderId = String(paymobOrder.id ?? "");
    const amountCents = Number(inquiry.amount_cents);
    const expectedAmountCents = Math.round(Number(order.total) * 100);
    const ledgerAmountCents = Math.round(Number(payment.amount) * 100);
    const currency = typeof inquiry.currency === "string"
      ? inquiry.currency.toUpperCase()
      : typeof paymobOrder.currency === "string"
        ? paymobOrder.currency.toUpperCase()
        : "";
    const integrationId = Number(inquiry.integration_id);
    const success = inquiry.success;
    const pending = inquiry.pending;

    // Never reconcile incomplete, pending, refunded, voided, mismatched, or non-final results.
    if (!transactionId
        || returnedOrderId !== intentionOrderId
        || pending !== false
        || typeof success !== "boolean"
        || inquiry.is_refunded === true
        || inquiry.is_voided === true
        || !Number.isSafeInteger(amountCents)
        || amountCents <= 0
        || amountCents !== expectedAmountCents
        || amountCents !== ledgerAmountCents
        || !currency
        || currency !== String(order.currency).toUpperCase()
        || currency !== String(payment.currency).toUpperCase()
        || !Number.isSafeInteger(integrationId)
        || integrationId !== Number(configuredIntegrationId)) {
      return;
    }

    await admin.rpc("process_paymob_callback", {
      // Use the provider transaction ID so a later webhook remains idempotent.
      p_provider_event_id: transactionId,
      p_paymob_order_id: returnedOrderId,
      p_suly_order_id: order.id,
      p_success: success,
      p_amount_cents: amountCents,
      p_currency: currency,
      p_payload: {
        source: "transaction_inquiry",
        transaction_id: transactionId,
        paymob_order_id: returnedOrderId,
        success,
        pending,
        amount_cents: amountCents,
        currency,
        integration_id: integrationId,
      },
    });
  } catch {
    // Inquiry is best-effort only. The verified webhook remains the primary payment signal.
  }
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

  const { data: publicOrder, error } = await admin.rpc("get_public_order", {
    p_order_number: orderNumber,
    p_public_token: token,
  });
  if (error) return response(503, { error: "تعذر تحميل حالة الطلب." });
  if (!publicOrder) return response(404, { error: "لم يتم العثور على الطلب." });

  if (publicOrder.payment_method === "paymob" && publicOrder.payment_status === "pending") {
    await reconcilePendingPaymobOrder(admin, orderNumber, token);
    const { data: refreshed, error: refreshError } = await admin.rpc("get_public_order", {
      p_order_number: orderNumber,
      p_public_token: token,
    });
    if (!refreshError && refreshed) return response(200, { ok: true, order: refreshed });
  }

  return response(200, { ok: true, order: publicOrder });
});
