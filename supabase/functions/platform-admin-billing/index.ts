import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subscriptionStatuses = new Set(["trialing", "active", "past_due", "cancelled", "suspended"]);
const invoiceStatuses = new Set(["draft", "open", "paid", "void", "uncollectible"]);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function validDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET" && req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return reply(401, { error: "Authentication required." });

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 12_000) return reply(413, { error: "Request is too large." });
    try { body = await req.json(); }
    catch { return reply(400, { error: "Invalid JSON request." }); }
  }

  try {
    const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply(401, { error: "Invalid session." });
    if (authData.user.app_metadata?.role !== "platform_admin") {
      return reply(403, { error: "Platform administrator access required." });
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    if (req.method === "GET") {
      const [plans, subscriptions, invoices] = await Promise.all([
        admin.from("subscription_plans").select("*").order("monthly_price", { ascending: true }).order("name", { ascending: true }),
        admin.from("store_subscriptions").select("id,store_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_end,cancel_at_period_end,created_at,stores(name,slug),subscription_plans(name,code)").order("updated_at", { ascending: false }).limit(100),
        admin.from("subscription_invoices").select("id,invoice_number,store_id,subscription_id,amount,currency,status,period_start,period_end,due_at,paid_at,payment_reference,memo,created_at,stores(name,slug)").order("created_at", { ascending: false }).limit(100),
      ]);
      if (plans.error || subscriptions.error || invoices.error) return reply(503, { error: "تعذر تحميل بيانات الاشتراكات والفوترة." });
      return reply(200, { ok: true, plans: plans.data ?? [], subscriptions: subscriptions.data ?? [], invoices: invoices.data ?? [] });
    }

    const action = typeof body.action === "string" ? body.action : "";
    if (action === "save_plan") {
      const id = typeof body.id === "string" ? body.id : null;
      const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
      const monthly = numberOrNull(body.monthly_price);
      const yearly = numberOrNull(body.yearly_price);
      const maxProducts = numberOrNull(body.max_products);
      const maxTeam = numberOrNull(body.max_team_members);
      const maxOrders = numberOrNull(body.max_monthly_orders);
      const features = Array.isArray(body.features) ? body.features : [];
      if ((id && !uuidPattern.test(id)) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || code.length > 40
          || name.length < 2 || name.length > 80 || description.length > 500
          || !/^[A-Z]{3}$/.test(currency)
          || monthly === null || !Number.isFinite(monthly) || monthly < 0 || monthly > 1_000_000_000
          || yearly === null || !Number.isFinite(yearly) || yearly < 0 || yearly > 1_000_000_000
          || [maxProducts, maxTeam, maxOrders].some(v => v !== null && (!Number.isInteger(v) || v < 0))
          || (maxTeam !== null && maxTeam < 1)
          || features.length > 30 || features.some(v => typeof v !== "string" || v.length > 100)) {
        return reply(400, { error: "بيانات الخطة أو حدود الاستخدام غير صالحة." });
      }
      const payload = {
        code, name, description: description || null, currency,
        monthly_price: monthly, yearly_price: yearly,
        max_products: maxProducts, max_team_members: maxTeam, max_monthly_orders: maxOrders,
        features, updated_at: new Date().toISOString(),
      };
      const result = id
        ? await admin.from("subscription_plans").update(payload).eq("id", id).select("*").maybeSingle()
        : await admin.from("subscription_plans").insert(payload).select("*").single();
      if (result.error) return reply(result.error.code === "23505" ? 409 : 400, { error: result.error.code === "23505" ? "رمز الخطة مستخدم بالفعل." : "تعذر حفظ الخطة." });
      if (!result.data) return reply(404, { error: "الخطة غير موجودة." });
      return reply(200, { ok: true, plan: result.data });
    }

    if (action === "set_plan_active") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!uuidPattern.test(id) || typeof body.is_active !== "boolean") return reply(400, { error: "طلب تغيير حالة الخطة غير صالح." });
      const { data, error } = await admin.from("subscription_plans")
        .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
        .eq("id", id).select("id,is_active").maybeSingle();
      if (error) return reply(400, { error: "تعذر تحديث حالة الخطة." });
      if (!data) return reply(404, { error: "الخطة غير موجودة." });
      return reply(200, { ok: true, plan: data });
    }

    if (action === "assign_subscription") {
      const storeId = typeof body.store_id === "string" ? body.store_id : "";
      const planId = typeof body.plan_id === "string" ? body.plan_id : "";
      const status = typeof body.status === "string" ? body.status : "";
      const interval = typeof body.billing_interval === "string" ? body.billing_interval : "";
      const start = validDate(body.current_period_start);
      const end = validDate(body.current_period_end);
      const trialEnd = validDate(body.trial_end);
      const notes = typeof body.admin_notes === "string" ? body.admin_notes.trim() : "";
      if (!uuidPattern.test(storeId) || !uuidPattern.test(planId) || !subscriptionStatuses.has(status)
          || !["monthly","yearly","manual"].includes(interval)
          || start === undefined || end === undefined || trialEnd === undefined || notes.length > 1000
          || (start && end && Date.parse(end) <= Date.parse(start))) {
        return reply(400, { error: "بيانات الاشتراك أو مدة التفعيل غير صالحة." });
      }
      const [{ data: store }, { data: plan }] = await Promise.all([
        admin.from("stores").select("id").eq("id", storeId).maybeSingle(),
        admin.from("subscription_plans").select("id").eq("id", planId).eq("is_active", true).maybeSingle(),
      ]);
      if (!store) return reply(404, { error: "المتجر غير موجود." });
      if (!plan) return reply(404, { error: "الخطة غير موجودة أو غير مفعلة." });
      const { data, error } = await admin.from("store_subscriptions").upsert({
        store_id: storeId, plan_id: planId, status, billing_interval: interval,
        current_period_start: start ?? new Date().toISOString(),
        current_period_end: end, trial_end: trialEnd,
        admin_notes: notes || null, created_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id" }).select("id,store_id,plan_id,status,billing_interval,current_period_start,current_period_end").single();
      if (error) return reply(400, { error: "تعذر حفظ الاشتراك." });
      return reply(200, { ok: true, subscription: data });
    }

    if (action === "create_invoice") {
      const storeId = typeof body.store_id === "string" ? body.store_id : "";
      const amount = numberOrNull(body.amount);
      const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
      const dueAt = validDate(body.due_at);
      const memo = typeof body.memo === "string" ? body.memo.trim() : "";
      const periodStart = typeof body.period_start === "string" ? body.period_start : null;
      const periodEnd = typeof body.period_end === "string" ? body.period_end : null;
      if (!uuidPattern.test(storeId) || amount === null || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000
          || !/^[A-Z]{3}$/.test(currency) || dueAt === undefined || memo.length > 1000
          || (periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(periodStart))
          || (periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))
          || (periodStart && periodEnd && periodEnd < periodStart)) {
        return reply(400, { error: "بيانات الفاتورة غير صالحة." });
      }
      const { data: subscription } = await admin.from("store_subscriptions").select("id").eq("store_id", storeId).maybeSingle();
      const { data, error } = await admin.from("subscription_invoices").insert({
        store_id: storeId, subscription_id: subscription?.id ?? null,
        amount, currency, status: "open",
        period_start: periodStart, period_end: periodEnd, due_at: dueAt,
        memo: memo || null,
      }).select("id,invoice_number,store_id,amount,currency,status,due_at").single();
      if (error) return reply(400, { error: "تعذر إنشاء الفاتورة." });
      return reply(200, { ok: true, invoice: data });
    }

    if (action === "mark_invoice_paid") {
      const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
      const reference = typeof body.payment_reference === "string" ? body.payment_reference.trim() : "";
      if (!uuidPattern.test(invoiceId) || reference.length > 160) return reply(400, { error: "بيانات إثبات السداد غير صالحة." });
      const { data, error } = await admin.from("subscription_invoices")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_reference: reference || null })
        .eq("id", invoiceId).in("status", ["open","draft"])
        .select("id,invoice_number,status,paid_at,payment_reference").maybeSingle();
      if (error) return reply(400, { error: "تعذر تحديث الفاتورة." });
      if (!data) return reply(409, { error: "الفاتورة غير موجودة أو ليست مفتوحة." });
      return reply(200, { ok: true, invoice: data });
    }

    if (action === "update_subscription_status") {
      const id = typeof body.id === "string" ? body.id : "";
      const status = typeof body.status === "string" ? body.status : "";
      if (!uuidPattern.test(id) || !subscriptionStatuses.has(status)) return reply(400, { error: "حالة الاشتراك غير صالحة." });
      const { data, error } = await admin.from("store_subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id).select("id,status,store_id").maybeSingle();
      if (error) return reply(400, { error: "تعذر تحديث حالة الاشتراك." });
      if (!data) return reply(404, { error: "الاشتراك غير موجود." });
      return reply(200, { ok: true, subscription: data });
    }

    return reply(400, { error: "Unknown billing action." });
  } catch {
    return reply(500, { error: "Unexpected platform billing error." });
  }
});
