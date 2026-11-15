import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-store-slug",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return reply(405, { error: "Method not allowed." });

  const slug = (req.headers.get("x-store-slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    return reply(400, { error: "Store slug is invalid." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, { error: "Public store information is unavailable." });

  try {
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (storeError || !store) return reply(404, { error: "Store not found." });

    const { data, error } = await admin.from("store_settings")
      .select("announcement,support_email,support_phone")
      .eq("store_id", store.id).maybeSingle();
    if (error) return reply(503, { error: "Public store information is unavailable." });

    return reply(200, {
      ok: true,
      announcement: typeof data?.announcement === "string" ? data.announcement : null,
      support_email: typeof data?.support_email === "string" ? data.support_email : null,
      support_phone: typeof data?.support_phone === "string" ? data.support_phone : null,
    });
  } catch {
    return reply(500, { error: "Unexpected server error." });
  }
});
