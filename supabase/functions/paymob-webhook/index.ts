import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function valueAt(obj: Record<string, any>, path: string[]): unknown {
  let value: any = obj;
  for (const key of path) {
    if (!value || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

function toHmacValue(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("The callback omitted a field required by Paymob HMAC verification.");
  }
  if (typeof value === "object") throw new Error("Unexpected object in Paymob HMAC field.");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

async function calculateHmac(obj: Record<string, any>, secret: string): Promise<string> {
  const fields: string[][] = [
    ["amount_cents"],
    ["created_at"],
    ["currency"],
    ["error_occured"],
    ["has_parent_transaction"],
    ["id"],
    ["integration_id"],
    ["is_3d_secure"],
    ["is_auth"],
    ["is_capture"],
    ["is_refunded"],
    ["is_standalone_payment"],
    ["is_voided"],
    ["order", "id"],
    ["owner"],
    ["pending"],
    ["source_data", "pan"],
    ["source_data", "sub_type"],
    ["source_data", "type"],
    ["success"],
  ];

  const message = fields.map(path => toHmacValue(valueAt(obj, path))).join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "Method not allowed." });

  const secret = Deno.env.get("PAYMOB_HMAC_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRoleKey) {
    return response(503, { error: "Webhook verification is not configured." });
  }

  const suppliedHmac = new URL(req.url).searchParams.get("hmac") ?? "";
  if (!/^[a-f0-9]{128}$/i.test(suppliedHmac)) {
    return response(401, { error: "Invalid callback signature." });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return response(400, { error: "Invalid callback JSON." });
  }

  const obj = body?.obj;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return response(400, { error: "Invalid Paymob transaction object." });
  }

  let expectedHmac: string;
  try {
    expectedHmac = await calculateHmac(obj, secret);
  } catch {
    // Null HMAC fields are not guessed. This endpoint accepts only verified callback shapes.
    return response(400, { error: "Unsupported Paymob callback field shape." });
  }
  if (!constantTimeEqual(expectedHmac.toLowerCase(), suppliedHmac.toLowerCase())) {
    return response(401, { error: "Invalid callback signature." });
  }

  const transactionId = String(obj.id ?? "");
  const paymobOrderId = String(obj.order?.id ?? "");
  const merchantOrderId = String(obj.order?.merchant_order_id ?? obj.merchant_order_id ?? "");
  const success = obj.success;
  const amountCents = Number(obj.amount_cents);
  const currency = typeof obj.currency === "string" ? obj.currency.toUpperCase() : "";
  const configuredIntegrationId = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";

  if (!transactionId || !paymobOrderId
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantOrderId)
      || typeof success !== "boolean"
      || !Number.isSafeInteger(amountCents) || amountCents <= 0
      || !/^[A-Z]{3}$/.test(currency)
      || !/^\\d+$/.test(configuredIntegrationId)
      || Number(obj.integration_id) !== Number(configuredIntegrationId)) {
    return response(400, { error: "Missing required transaction reference fields." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc("process_paymob_callback", {
    p_provider_event_id: transactionId,
    p_paymob_order_id: paymobOrderId,
    p_suly_order_id: merchantOrderId,
    p_success: success,
    p_amount_cents: amountCents,
    p_currency: currency,
    p_payload: {
      transaction_id: transactionId,
      paymob_order_id: paymobOrderId,
      success,
      amount_cents: amountCents,
      currency,
      created_at: typeof obj.created_at === "string" ? obj.created_at : null,
      integration_id: obj.integration_id ?? null,
    },
  });

  if (error) return response(400, { error: "The verified Paymob callback did not match a pending order." });
  return response(200, { ok: true, result: data });
});
