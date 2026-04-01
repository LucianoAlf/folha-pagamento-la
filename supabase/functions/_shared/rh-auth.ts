import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type RhAuthContext = {
  userId: string;
  role: string;
  adminClient: ReturnType<typeof createClient>;
};

export const RH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function rhJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export async function requireRhAdminContext(req: Request): Promise<RhAuthContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error("Supabase environment is not configured.");
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Invalid or expired token");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const role = String(profile?.role || "user");
  if (!["admin", "rh"].includes(role)) {
    throw new Error("Acesso restrito ao RH.");
  }

  return {
    userId: user.id,
    role,
    adminClient,
  };
}
