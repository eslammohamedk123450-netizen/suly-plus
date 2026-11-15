import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-store-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedRoles = new Set(["admin", "manager", "staff"]);

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
    if (length > 8_192) return reply(413, { error: "Request is too large." });
    try { body = await req.json(); }
    catch { return reply(400, { error: "Invalid JSON request." }); }
  }

  const storeId = (req.method === "GET" ? req.headers.get("x-store-id") : body.store_id);
  if (typeof storeId !== "string" || !uuidPattern.test(storeId)) {
    return reply(400, { error: "Store id is invalid." });
  }

  try {
    const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply(401, { error: "Invalid session." });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: membership, error: memberError } = await admin.from("store_members")
      .select("role").eq("store_id", storeId).eq("user_id", authData.user.id).maybeSingle();
    if (memberError) return reply(503, { error: "Unable to verify store permissions." });
    if (membership?.role !== "owner") return reply(403, { error: "Only the store owner can manage team members." });

    if (req.method === "GET") {
      const [membersResult, invitationsResult, auditResult] = await Promise.all([
        admin.from("store_members").select("user_id,role,created_at").eq("store_id", storeId).order("created_at", { ascending: true }).limit(100),
        admin.from("store_team_invitations").select("id,user_id,email,role,status,expires_at,created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(50),
        admin.from("store_team_audit_log").select("id,action,email,previous_role,new_role,created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(20),
      ]);
      if (membersResult.error || invitationsResult.error || auditResult.error) {
        return reply(503, { error: "Unable to load store team." });
      }
      const memberRows = membersResult.data ?? [];
      const ids = memberRows.map(row => row.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await admin.from("profiles").select("id,full_name").in("id", ids)
        : { data: [], error: null };
      if (profileError) return reply(503, { error: "Unable to load team profiles." });
      const profileMap = new Map((profiles ?? []).map((profile: { id: string; full_name: string | null }) => [profile.id, profile.full_name ?? ""]));
      const members = await Promise.all(memberRows.map(async row => {
        const { data } = await admin.auth.admin.getUserById(row.user_id);
        return {
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at,
          full_name: profileMap.get(row.user_id) ?? "",
          email: data.user?.email ?? "",
        };
      }));
      return reply(200, {
        ok: true,
        members,
        invitations: invitationsResult.data ?? [],
        audit: auditResult.data ?? [],
      });
    }

    const action = typeof body.action === "string" ? body.action : "";
    if (action === "invite") {
      // Check the subscription before sending an invitation email.
      const [{ data: subscription, error: subscriptionError }, { count: currentMembers, error: memberCountError }] = await Promise.all([
        admin.from("store_subscriptions")
          .select("status,billing_interval,current_period_start,current_period_end,trial_end,subscription_plans(is_active,max_team_members)")
          .eq("store_id", storeId).maybeSingle(),
        admin.from("store_members").select("user_id", { count: "exact", head: true }).eq("store_id", storeId),
      ]);
      if (subscriptionError || memberCountError) return reply(503, { error: "تعذر التحقق من حدود خطة المتجر." });
      if (subscription) {
        const plan = Array.isArray(subscription.subscription_plans)
          ? subscription.subscription_plans[0] : subscription.subscription_plans;
        const now = Date.now();
        const periodStart = subscription.current_period_start ? Date.parse(subscription.current_period_start) : 0;
        const periodEnd = subscription.current_period_end ? Date.parse(subscription.current_period_end) : null;
        const trialEnd = subscription.trial_end ? Date.parse(subscription.trial_end) : null;
        const periodStarted = periodStart <= now;
        const periodNotExpired = periodEnd === null || periodEnd > now;
        const trialStillValid = subscription.status !== "trialing" || (trialEnd !== null && trialEnd > now);
        const activeTermHasEnd = !["monthly","yearly"].includes(subscription.billing_interval) || periodEnd !== null;
        if (!plan?.is_active || !["trialing","active"].includes(subscription.status)
            || !periodStarted || !periodNotExpired || !trialStillValid || !activeTermHasEnd) {
          return reply(422, { error: "اشتراك المتجر منتهي أو غير نشط. لا يمكن إضافة أعضاء جدد قبل تجديده أو إعادة تفعيله." });
        }
        if (plan.max_team_members !== null && plan.max_team_members !== undefined
            && (currentMembers ?? 0) >= Number(plan.max_team_members)) {
          return reply(422, { error: "وصل المتجر إلى الحد الأقصى لأعضاء الفريق في خطته الحالية." });
        }
      }

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = typeof body.role === "string" ? body.role : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !allowedRoles.has(role)) {
        return reply(400, { error: "بيانات الدعوة أو الدور غير صالحة." });
      }

      const { data: existing, error: lookupError } = await admin.rpc("find_auth_user_for_team", { p_email: email });
      if (lookupError) return reply(503, { error: "تعذر التحقق من الحساب." });
      let invitedUserId: string;
      let invitationStatus: "pending" | "accepted";
      if (Array.isArray(existing) && existing.length > 0) {
        const existingUser = existing[0] as { user_id: string; email_confirmed_at: string | null };
        invitedUserId = existingUser.user_id;
        if (!existingUser.email_confirmed_at) {
          return reply(409, { error: "يوجد حساب بهذا البريد لكنه لم يؤكد بريده بعد. اطلب من صاحبه إكمال تأكيد الحساب أولًا." });
        }
        invitationStatus = "accepted";
        const { data: alreadyMember, error: checkError } = await admin.from("store_members")
          .select("user_id").eq("store_id", storeId).eq("user_id", invitedUserId).maybeSingle();
        if (checkError) return reply(503, { error: "تعذر التحقق من عضوية المستخدم." });
        if (alreadyMember) return reply(409, { error: "هذا المستخدم عضو بالفعل في المتجر." });
      } else {
        const publicUrl = (Deno.env.get("SULY_PUBLIC_URL") ?? "").trim();
        const redirectTo = publicUrl.startsWith("https://") ? `${publicUrl.replace(/\/$/, "")}/login` : undefined;
        const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
          ...(redirectTo ? { redirectTo } : {}),
        });
        if (inviteError || !inviteData.user) {
          const message = inviteError?.message ?? "";
          if (/already.*(registered|exists)|user.*already/i.test(message)) {
            return reply(409, { error: "الحساب موجود بالفعل. يجب أن يسجل صاحبه الدخول أولًا قبل إضافته." });
          }
          return reply(502, { error: "تعذر إرسال دعوة البريد. تحقق من إعدادات SMTP في Supabase." });
        }
        invitedUserId = inviteData.user.id;
        invitationStatus = "pending";
      }

      const { data, error } = await admin.rpc("add_store_team_member", {
        p_store_id: storeId,
        p_user_id: invitedUserId,
        p_email: email,
        p_role: role,
        p_actor_id: authData.user.id,
        p_status: invitationStatus,
      });
      if (error) {
        if (invitationStatus === "pending") {
          await admin.auth.admin.deleteUser(invitedUserId);
        }
        if (error.message.includes("already a store member")) return reply(409, { error: "هذا المستخدم عضو بالفعل في المتجر." });
        if (error.message.includes("PLAN_LIMIT_TEAM_MEMBERS_REACHED")) return reply(422, { error: "وصل المتجر إلى الحد الأقصى لأعضاء الفريق في خطته الحالية." });
        if (error.message.includes("SUBSCRIPTION_NOT_ACTIVE")) return reply(422, { error: "اشتراك المتجر غير نشط. لا يمكن إضافة أعضاء جدد." });
        return reply(400, { error: "تعذر حفظ دعوة الفريق." });
      }
      return reply(200, { ok: true, result: data, message: invitationStatus === "pending" ? "تم إرسال الدعوة بالبريد." : "تمت إضافة الحساب الموجود إلى المتجر." });
    }

    if (action === "change_role") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const role = typeof body.role === "string" ? body.role : "";
      if (!uuidPattern.test(userId) || !allowedRoles.has(role)) return reply(400, { error: "بيانات تغيير الدور غير صالحة." });
      const { data, error } = await admin.rpc("update_store_team_member_role", {
        p_store_id: storeId, p_user_id: userId, p_new_role: role, p_actor_id: authData.user.id,
      });
      if (error) return reply(400, { error: "تعذر تحديث دور العضو." });
      return reply(200, { ok: true, result: data });
    }

    if (action === "remove") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      if (!uuidPattern.test(userId)) return reply(400, { error: "بيانات إزالة العضو غير صالحة." });
      const { data, error } = await admin.rpc("remove_store_team_member", {
        p_store_id: storeId, p_user_id: userId, p_actor_id: authData.user.id,
      });
      if (error) return reply(400, { error: "تعذر إزالة العضو. لا يمكن إزالة مالك المتجر." });
      return reply(200, { ok: true, result: data });
    }

    return reply(400, { error: "Unknown team action." });
  } catch {
    return reply(500, { error: "Unexpected team management error." });
  }
});
