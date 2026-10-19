import {
  authenticateAdminRequest,
  createSupabaseAdminClient,
} from "@/lib/supabase/admin-server";

type InvitationRole = "student" | "tutor";
type InvitationRecord = {
  user_id: string | null;
  email: string;
  requested_role: InvitationRole;
  target_course_id: string | null;
  status: "pending" | "accepted";
};

const authUsersPerPage = 1000;

async function findAuthUserByEmail(
  client: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: authUsersPerPage,
    });
    if (error) {
      throw new Error(`Unable to check for an existing account: ${error.message}`);
    }

    const existingUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (existingUser) {
      return existingUser;
    }
    if (data.users.length < authUsersPerPage) {
      return null;
    }
  }
}

function getInvitationRedirect(request: Request, role: InvitationRole): string {
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const callback = new URL("/auth/callback", appUrl);
  callback.searchParams.set("role", role);
  return callback.toString();
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "The invitation details are invalid." }, { status: 400 });
  }

  const { email: inputEmail, role, courseId, resend } = payload as {
    email?: unknown;
    role?: unknown;
    courseId?: unknown;
    resend?: unknown;
  };
  const email = typeof inputEmail === "string" ? inputEmail.trim().toLowerCase() : "";
  if (
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (role !== "student" && role !== "tutor") ||
    (courseId !== undefined && courseId !== null && typeof courseId !== "string") ||
    (typeof courseId === "string" &&
      courseId !== "" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courseId)) ||
    (resend !== undefined && typeof resend !== "boolean")
  ) {
    return Response.json({ error: "Enter a valid email, account type, and course." }, { status: 400 });
  }
  if (role === "tutor" && courseId) {
    return Response.json({ error: "A course can only be assigned to a student." }, { status: 400 });
  }

  let client: ReturnType<typeof createSupabaseAdminClient>;
  try {
    client = createSupabaseAdminClient();
  } catch (error: unknown) {
    console.error("Supabase invitation configuration is unavailable", error);
    return Response.json({ error: "Invitations are not configured on the server." }, { status: 500 });
  }

  const authorization = await authenticateAdminRequest(request, client);
  if (authorization.response) {
    return authorization.response;
  }

  if (courseId) {
    const { data: course, error: courseError } = await client
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) {
      console.error("Unable to validate invitation course assignment", courseError);
      return Response.json({ error: "Unable to verify the selected course." }, { status: 500 });
    }
    if (!course) {
      return Response.json({ error: "The selected course no longer exists." }, { status: 400 });
    }
  }

  const { data: existingInvitation, error: invitationLookupError } = await client
    .from("admin_invitations")
    .select("user_id, email, requested_role, target_course_id, status")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (invitationLookupError) {
    console.error("Unable to check pending invitations", invitationLookupError);
    return Response.json({ error: "Unable to check for a pending invitation." }, { status: 500 });
  }

  let invitation = existingInvitation as InvitationRecord | null;
  if (invitation) {
    let authUser = null;
    if (invitation.user_id) {
      const { data, error } = await client.auth.admin.getUserById(invitation.user_id);
      if (error && error.status !== 404) {
        console.error("Unable to verify pending invite account", error);
        return Response.json({ error: "Unable to verify the pending invitation." }, { status: 500 });
      }
      authUser = data.user;
    } else {
      try {
        authUser = await findAuthUserByEmail(client, email);
      } catch (error: unknown) {
        console.error("Unable to find pending invite account", error);
        return Response.json(
          { error: error instanceof Error ? error.message : "Unable to check the pending invitation." },
          { status: 500 },
        );
      }
    }

    if (authUser?.email_confirmed_at) {
      return Response.json({ status: "account_exists" });
    }
    if (!resend) {
      return Response.json({ status: "invite_pending" });
    }
  } else {
    if (resend) {
      return Response.json({ error: "There is no pending invitation to resend." }, { status: 409 });
    }

    try {
      const existingUser = await findAuthUserByEmail(client, email);
      if (existingUser) {
        return Response.json({ status: "account_exists" });
      }
    } catch (error: unknown) {
      console.error("Unable to check for an existing invitation account", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Unable to check for an existing account." },
        { status: 500 },
      );
    }

    const { data: newInvitation, error: insertError } = await client
      .from("admin_invitations")
      .insert({
        email,
        requested_role: role,
        target_course_id: courseId || null,
      })
      .select("user_id, email, requested_role, target_course_id, status")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        return Response.json({ status: "invite_pending" });
      }
      console.error("Unable to track pending invitation", insertError);
      return Response.json({ error: "Unable to prepare the invitation." }, { status: 500 });
    }
    invitation = newInvitation as InvitationRecord;
  }

  const inviteRole = resend ? role as InvitationRole : invitation.requested_role;
  const inviteCourseId = resend ? courseId || null : invitation.target_course_id;
  let redirectTo: string;
  try {
    redirectTo = getInvitationRedirect(request, inviteRole);
  } catch (error: unknown) {
    console.error("Invalid invitation callback URL configuration", error);
    if (!existingInvitation) {
      const { error: cleanupError } = await client
        .from("admin_invitations")
        .delete()
        .eq("email", email)
        .eq("status", "pending")
        .is("user_id", null);
      if (cleanupError) {
        console.error("Unable to clean up invitation with invalid callback configuration", cleanupError);
      }
    }
    return Response.json({ error: "The invitation callback URL is not configured correctly." }, { status: 500 });
  }
  const { data: inviteData, error: inviteError } = await client.auth.admin.inviteUserByEmail(
    email,
    {
      data: { gps_tutor_admin_invite: true },
      redirectTo,
    },
  );
  if (inviteError) {
    if (!existingInvitation) {
      const { error: cleanupError } = await client
        .from("admin_invitations")
        .delete()
        .eq("email", email)
        .eq("status", "pending");
      if (cleanupError) {
        console.error("Unable to clean up failed invitation tracking", cleanupError);
      }
    }
    if (inviteError.code === "email_exists") {
      return Response.json({ status: "account_exists" });
    }
    console.error("Supabase failed to send an account invitation", inviteError);
    return Response.json({ error: `Unable to send the invitation: ${inviteError.message}` }, { status: 502 });
  }

  const { error: updateError } = await client
    .from("admin_invitations")
    .update({
      user_id: inviteData.user.id,
      requested_role: inviteRole,
      target_course_id: inviteCourseId,
      sent_at: new Date().toISOString(),
    })
    .eq("email", email)
    .eq("status", "pending");
  if (updateError) {
    console.error("Invitation was sent but tracking could not be updated", updateError);
    return Response.json(
      { error: "The invitation email was sent, but its status could not be saved. Retry and choose to resend if prompted." },
      { status: 500 },
    );
  }

  return Response.json({ status: "sent" });
}
