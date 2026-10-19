import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type AuthenticatedRequest =
  | { client: SupabaseClient; user: User; response?: never }
  | { client?: never; user?: never; response: Response };

export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin operations are not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function authenticateAdminRequest(
  request: Request,
  client: SupabaseClient,
): Promise<AuthenticatedRequest> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return {
      response: Response.json({ error: "Sign in as an administrator to continue." }, { status: 401 }),
    };
  }

  const { data: { user }, error: authError } = await client.auth.getUser(accessToken);
  if (authError || !user) {
    return {
      response: Response.json({ error: "Your sign-in session is invalid or expired." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to verify invitation administrator", profileError);
    return {
      response: Response.json({ error: "Unable to verify administrator permissions." }, { status: 500 }),
    };
  }
  if (profile?.role !== "admin") {
    return {
      response: Response.json({ error: "Only administrators can manage invitations." }, { status: 403 }),
    };
  }

  return { client, user };
}

export async function authenticateUserRequest(
  request: Request,
  client: SupabaseClient,
): Promise<AuthenticatedRequest> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return {
      response: Response.json({ error: "Sign in to accept this invitation." }, { status: 401 }),
    };
  }

  const { data: { user }, error } = await client.auth.getUser(accessToken);
  if (error || !user) {
    return {
      response: Response.json({ error: "Your sign-in session is invalid or expired." }, { status: 401 }),
    };
  }

  return { client, user };
}
