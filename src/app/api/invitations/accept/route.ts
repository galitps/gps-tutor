import {
  authenticateUserRequest,
  createSupabaseAdminClient,
} from "@/lib/supabase/admin-server";

type InvitationRecord = {
  user_id: string | null;
  email: string;
  requested_role: "student" | "tutor";
  target_course_id: string | null;
  status: "pending" | "accepted";
};

export async function POST(request: Request): Promise<Response> {
  let client: ReturnType<typeof createSupabaseAdminClient>;
  try {
    client = createSupabaseAdminClient();
  } catch (error: unknown) {
    console.error("Supabase invitation configuration is unavailable", error);
    return Response.json({ error: "Invitations are not configured on the server." }, { status: 500 });
  }

  const authentication = await authenticateUserRequest(request, client);
  if (authentication.response) {
    return authentication.response;
  }

  const { user } = authentication;
  let { data, error: invitationError } = await client
    .from("admin_invitations")
    .select("user_id, email, requested_role, target_course_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (invitationError) {
    console.error("Unable to look up accepted account invitation", invitationError);
    return Response.json({ error: "Unable to verify this invitation." }, { status: 500 });
  }
  if (!data && user.email) {
    const emailLookup = await client
      .from("admin_invitations")
      .select("user_id, email, requested_role, target_course_id, status")
      .eq("email", user.email.toLowerCase())
      .eq("status", "pending")
      .maybeSingle();
    data = emailLookup.data;
    invitationError = emailLookup.error;
    if (invitationError) {
      console.error("Unable to look up invitation by account email", invitationError);
      return Response.json({ error: "Unable to verify this invitation." }, { status: 500 });
    }
  }
  if (!data) {
    return Response.json({ status: "not_invited" });
  }

  const invitation = data as InvitationRecord;
  if (invitation.status === "accepted") {
    return Response.json({ status: "accepted" });
  }
  if (!user.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return Response.json({ error: "This sign-in email does not match the invitation." }, { status: 403 });
  }
  if (!user.email_confirmed_at) {
    return Response.json({ error: "Confirm your invited email before continuing." }, { status: 403 });
  }
  if (invitation.user_id !== user.id) {
    const { error: userUpdateError } = await client
      .from("admin_invitations")
      .update({ user_id: user.id })
      .eq("email", invitation.email)
      .eq("status", "pending");
    if (userUpdateError) {
      console.error("Unable to associate accepted invitation with Auth account", userUpdateError);
      return Response.json({ error: "Unable to finish setting up the invited account." }, { status: 500 });
    }
  }

  const { data: existingProfile, error: profileLookupError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileLookupError) {
    console.error("Unable to check invited user profile", profileLookupError);
    return Response.json({ error: "Unable to set up the invited account." }, { status: 500 });
  }
  if (existingProfile && existingProfile.role !== invitation.requested_role) {
    return Response.json(
      { error: "This account already has a different role. Contact an administrator." },
      { status: 409 },
    );
  }

  if (!existingProfile) {
    const { error: profileInsertError } = await client.from("profiles").insert({
      id: user.id,
      email: user.email,
      role: invitation.requested_role,
    });
    if (profileInsertError && profileInsertError.code !== "23505") {
      console.error("Unable to create invited user profile", profileInsertError);
      return Response.json({ error: "Unable to create the invited account profile." }, { status: 500 });
    }
    if (profileInsertError?.code === "23505") {
      const { data: concurrentProfile, error: concurrentProfileError } = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (concurrentProfileError || concurrentProfile?.role !== invitation.requested_role) {
        console.error("Invited profile conflicted with another account profile", concurrentProfileError);
        return Response.json(
          { error: "This account already has a different role. Contact an administrator." },
          { status: 409 },
        );
      }
    }
  }

  if (invitation.requested_role === "student" && invitation.target_course_id) {
    const { error: sectionInsertError } = await client.from("course_sections").upsert(
      {
        course_id: invitation.target_course_id,
        student_id: user.id,
      },
      { onConflict: "course_id,student_id", ignoreDuplicates: true },
    );
    if (sectionInsertError) {
      console.error("Unable to assign invited student to course", sectionInsertError);
      return Response.json({ error: "The account was created, but its course assignment could not be completed. Retry sign-in to finish setup." }, { status: 500 });
    }
  }

  const { error: onboardingDeleteError } = await client
    .from("onboarding_requests")
    .delete()
    .eq("user_id", user.id);
  if (onboardingDeleteError) {
    console.error("Unable to clear invited user's onboarding request", onboardingDeleteError);
    return Response.json(
      { error: "The account was set up, but its request could not be cleared. Retry sign-in to finish." },
      { status: 500 },
    );
  }

  const { error: acceptedError } = await client
    .from("admin_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (acceptedError) {
    console.error("Unable to mark account invitation accepted", acceptedError);
    return Response.json({ error: "The account was set up, but its invitation status could not be updated. Retry sign-in to finish." }, { status: 500 });
  }

  return Response.json({ status: "accepted" });
}
