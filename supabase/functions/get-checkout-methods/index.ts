const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-store-slug",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: corsHeaders });

  const integrationId = Deno.env.get("PAYMOB_INTEGRATION_ID") ?? "";
  const requestedStoreSlug = (req.headers.get("x-store-slug") ?? "").trim().toLowerCase();
  const enabledStoreSlug = (Deno.env.get("PAYMOB_ENABLED_STORE_SLUG") ?? "").trim().toLowerCase();
  const publicOrigin = Deno.env.get("SULY_PUBLIC_URL") ?? "";
  const paymobEnabled = Boolean(
    requestedStoreSlug
    && enabledStoreSlug
    && requestedStoreSlug === enabledStoreSlug
    && Deno.env.get("PAYMOB_SECRET_KEY")
    && Deno.env.get("PAYMOB_PUBLIC_KEY")
    && Deno.env.get("PAYMOB_HMAC_SECRET")
    && publicOrigin.startsWith("https://")
    && /^\\d+$/.test(integrationId)
  );

  return new Response(JSON.stringify({
    methods: {
      cash_on_delivery: true,
      paymob: paymobEnabled,
    },
  }), { status: 200, headers: corsHeaders });
});
