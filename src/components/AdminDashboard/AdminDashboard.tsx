"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearLoginMode, getLoginMode } from "@/lib/auth/login-mode";

type ProfileRole = "student" | "tutor";
type AdminProfile = {
  id: string;
  email: string | null;
  role: ProfileRole | "admin";
  is_tutor: boolean;
};
type Course = { id: string; name: string; description: string };
type CourseSection = {
  id: string;
  course_id: string;
  student_id: string;
  tutor_id: string | null;
};
type OnboardingRequest = {
  user_id: string;
  email: string;
  requested_role: ProfileRole;
  message: string;
  created_at: string;
};
type DashboardData = {
  adminId: string;
  courses: Course[];
  profiles: AdminProfile[];
  sections: CourseSection[];
  requests: OnboardingRequest[];
};

function isProfileRole(value: unknown): value is ProfileRole {
  return value === "student" || value === "tutor";
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isAssigningStudent, setIsAssigningStudent] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<ProfileRole>("student");
  const [newUserCourseId, setNewUserCourseId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProfileRole>("student");
  const [inviteCourseId, setInviteCourseId] = useState("");
  const [requestCourseIds, setRequestCourseIds] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadDashboard(): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      throw new Error(`Unable to verify your sign-in: ${authError.message}`);
    }
    if (!user) {
      throw new Error("Sign in with an administrator account to continue.");
    }
    if (getLoginMode() !== "admin") {
      throw new Error("End your current session and sign in using the Admin account type.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      throw new Error(`Unable to verify your account role: ${profileError.message}`);
    }
    if (profile?.role !== "admin") {
      throw new Error("This screen is available to administrators only.");
    }

    const [coursesResult, profilesResult, sectionsResult, requestsResult] = await Promise.all([
      supabase
        .from("courses")
        .select("id, name, description")
        .order("name", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, email, role, is_tutor")
        .in("role", ["student", "tutor", "admin"])
        .order("email", { ascending: true }),
      supabase
        .from("course_sections")
        .select("id, course_id, student_id, tutor_id")
        .order("created_at", { ascending: true }),
      supabase
        .from("onboarding_requests")
        .select("user_id, email, requested_role, message, created_at")
        .order("created_at", { ascending: true }),
    ]);
    if (coursesResult.error) {
      throw new Error(`Unable to load courses: ${coursesResult.error.message}`);
    }
    if (profilesResult.error) {
      throw new Error(`Unable to load student and tutor accounts: ${profilesResult.error.message}`);
    }
    if (sectionsResult.error) {
      throw new Error(`Unable to load course assignments: ${sectionsResult.error.message}`);
    }
    if (requestsResult.error) {
      throw new Error(`Unable to load account requests: ${requestsResult.error.message}`);
    }

    const profiles = (profilesResult.data ?? []).flatMap((candidate) => {
      if (
        !isProfileRole(candidate.role) &&
        candidate.role !== "admin"
      ) {
        return [];
      }
      return [{
        id: candidate.id,
        email: candidate.email,
        role: candidate.role,
        is_tutor: candidate.is_tutor === true,
      }];
    });
    setData({
      adminId: user.id,
      courses: (coursesResult.data ?? []) as Course[],
      profiles,
      sections: (sectionsResult.data ?? []) as CourseSection[],
      requests: (requestsResult.data ?? []) as OnboardingRequest[],
    });
  }

  useEffect(() => {
    let active = true;

    async function initializeDashboard(): Promise<void> {
      try {
        await loadDashboard();
      } catch (error: unknown) {
        console.error("Unable to open administrator dashboard", error);
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load administrator tools.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void initializeDashboard();
    return () => {
      active = false;
    };
  }, []);

  async function createCourse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!data) {
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    setIsSavingCourse(true);
    try {
      const { error } = await getSupabaseBrowserClient().from("courses").insert({
        name: courseName.trim(),
        description: courseDescription.trim(),
        created_by: data.adminId,
      });
      if (error) {
        throw new Error(`Unable to create course: ${error.message}`);
      }
      setCourseName("");
      setCourseDescription("");
      setSuccessMessage("Course created.");
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to create course", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create course.",
      );
    } finally {
      setIsSavingCourse(false);
    }
  }

  async function assignStudent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedCourseId || !selectedStudentId) {
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    setIsAssigningStudent(true);
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("course_sections")
        .insert({
          course_id: selectedCourseId,
          student_id: selectedStudentId,
        });
      if (error) {
        if (error.code === "23505") {
          throw new Error("This student already has a section for that course.");
        }
        throw new Error(`Unable to assign course to student: ${error.message}`);
      }
      setSuccessMessage("Course assigned to student.");
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to assign course to student", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to assign course to student.",
      );
    } finally {
      setIsAssigningStudent(false);
    }
  }

  async function assignTutor(
    sectionId: string,
    tutorId: string | null,
  ): Promise<void> {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("course_sections")
        .update({ tutor_id: tutorId || null })
        .eq("id", sectionId);
      if (error) {
        throw new Error(`Unable to assign tutor: ${error.message}`);
      }
      setSuccessMessage("Tutor assignment updated.");
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to assign tutor to course section", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the tutor assignment.",
      );
    }
  }

  async function createProfile(
    email: string,
    role: ProfileRole,
    courseId: string | null,
  ): Promise<boolean> {
    setErrorMessage("");
    setSuccessMessage("");
    setIsCreatingProfile(true);
    try {
      const { error } = await getSupabaseBrowserClient().rpc("admin_create_profile", {
        target_email: email.trim(),
        target_role: role,
        target_course_id: courseId || null,
      });
      if (error) {
        throw new Error(`Unable to add ${role}: ${error.message}`);
      }
      setSuccessMessage(
        role === "student" && courseId
          ? "Student added and assigned to the selected course."
          : `${role === "student" ? "Student" : "Tutor"} added.`,
      );
      await loadDashboard();
      return true;
    } catch (error: unknown) {
      console.error("Unable to create user profile", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to add user.");
      return false;
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function addUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (await createProfile(newUserEmail, newUserRole, newUserCourseId)) {
      setNewUserEmail("");
      setNewUserCourseId("");
    }
  }

  async function sendInvitation(
    email: string,
    role: ProfileRole,
    courseId: string,
    resend = false,
  ): Promise<"sent" | "invite_pending" | "account_exists"> {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(`Unable to verify your sign-in: ${sessionError.message}`);
    }
    if (!session?.access_token) {
      throw new Error("Sign in again as an administrator to send invitations.");
    }

    const response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        role,
        courseId: courseId || null,
        resend,
      }),
    });
    const result = await response.json() as {
      status?: string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error ?? "Unable to send the invitation.");
    }
    if (
      result.status !== "sent" &&
      result.status !== "invite_pending" &&
      result.status !== "account_exists"
    ) {
      throw new Error("The invitation service returned an unexpected response.");
    }
    return result.status;
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSendingInvitation(true);

    try {
      let result = await sendInvitation(inviteEmail, inviteRole, inviteCourseId);
      if (result === "account_exists") {
        setErrorMessage("An account with this email already exists. Nothing was changed.");
        return;
      }
      if (result === "invite_pending") {
        if (!window.confirm(
          `An invitation to ${inviteEmail.trim()} is still pending. Send another invitation email?`,
        )) {
          return;
        }
        result = await sendInvitation(inviteEmail, inviteRole, inviteCourseId, true);
        if (result === "account_exists") {
          setErrorMessage("An account with this email already exists. Nothing was changed.");
          return;
        }
        if (result === "invite_pending") {
          throw new Error("The invitation is still pending. Try again in a moment.");
        }
      }

      setInviteEmail("");
      setInviteCourseId("");
      setSuccessMessage("Invitation email sent. The account and course assignment will be set up when the user accepts.");
    } catch (error: unknown) {
      console.error("Unable to send account invitation", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send the invitation.",
      );
    } finally {
      setIsSendingInvitation(false);
    }
  }

  async function deleteProfile(profile: AdminProfile): Promise<void> {
    if (!data || profile.role === "admin") {
      return;
    }
    const assignments = data.sections.filter(
      (section) =>
        section.student_id === profile.id || section.tutor_id === profile.id,
    );
    const assignmentDescription = assignments.length
      ? `\n\n${assignments.length} existing course assignment${assignments.length === 1 ? "" : "s"} will also be removed.`
      : "";
    if (
      !window.confirm(
        `Delete ${profile.role} ${profile.email ?? profile.id}?${assignmentDescription}\n\nThis also permanently removes the user's sign-in account.`,
      )
    ) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await getSupabaseBrowserClient().rpc("admin_delete_profile", {
        target_profile_id: profile.id,
      });
      if (error) {
        throw new Error(`Unable to delete ${profile.role}: ${error.message}`);
      }
      setSuccessMessage(`${profile.role === "student" ? "Student" : "Tutor"} deleted.`);
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to delete user profile", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete user.");
    }
  }

  async function deleteCourse(course: Course): Promise<void> {
    if (!data) {
      return;
    }
    const assignmentCount = data.sections.filter(
      (section) => section.course_id === course.id,
    ).length;
    if (
      !window.confirm(
        `Delete course "${course.name}"?${assignmentCount ? `\n\n${assignmentCount} course assignment${assignmentCount === 1 ? "" : "s"} will also be removed.` : ""}`,
      )
    ) {
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("courses")
        .delete()
        .eq("id", course.id);
      if (error) {
        throw new Error(`Unable to delete course: ${error.message}`);
      }
      setSuccessMessage("Course deleted.");
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to delete course", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete course.");
    }
  }

  async function deleteAssignment(section: CourseSection): Promise<void> {
    const course = data?.courses.find(({ id }) => id === section.course_id);
    if (
      !window.confirm(
        `Delete the ${course?.name ?? "course"} assignment for ${profileById.get(section.student_id)?.email ?? "this student"}? This also removes the section's session data.`,
      )
    ) {
      return;
    }
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("course_sections")
        .delete()
        .eq("id", section.id);
      if (error) {
        throw new Error(`Unable to delete course assignment: ${error.message}`);
      }
      setSuccessMessage("Course assignment deleted.");
      await loadDashboard();
    } catch (error: unknown) {
      console.error("Unable to delete course assignment", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete course assignment.",
      );
    }
  }

  async function signOut(): Promise<void> {
    const { error } = await getSupabaseBrowserClient().auth.signOut({
      scope: "local",
    });
    if (error) {
      setErrorMessage(`Unable to sign out: ${error.message}`);
      return;
    }
    clearLoginMode();
    window.location.replace("/");
  }

  const students = data?.profiles.filter(({ role }) => role === "student") ?? [];
  const tutors =
    data?.profiles.filter(
      ({ role, is_tutor }) => role === "tutor" || (role === "admin" && is_tutor),
    ) ?? [];
  const courseById = new Map(data?.courses.map((course) => [course.id, course]) ?? []);
  const profileById = new Map(data?.profiles.map((profile) => [profile.id, profile]) ?? []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">
              GPS Tutor administration
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Manage users and courses</h1>
            <p className="mt-1 text-sm text-slate-400">
              Admin accounts cannot enter tutoring sessions. Sign out and sign in as a tutor to tutor a student.
            </p>
          </div>
          <button
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            onClick={() => void signOut()}
            type="button"
          >
            Sign out
          </button>
        </header>

        {errorMessage && (
          <p className="mt-5 rounded-lg bg-red-950/60 p-3 text-sm text-red-200" role="alert">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="mt-5 rounded-lg bg-emerald-950/60 p-3 text-sm text-emerald-200" role="status">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p aria-live="polite" className="mt-8 text-sm text-slate-300" role="status">
            Loading administration data...
          </p>
        ) : data ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Invite a new student or tutor</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Send an automated invitation email. The account and optional course assignment are created after the user accepts.
                </p>
                <form className="mt-4 space-y-3" onSubmit={(event) => void inviteUser(event)}>
                  <label className="block text-sm text-slate-300" htmlFor="new-user-email">
                    Email
                  </label>
                  <input
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="new-user-email"
                    onChange={(event) => setInviteEmail(event.target.value)}
                    required
                    type="email"
                    value={inviteEmail}
                  />
                  <label className="block text-sm text-slate-300" htmlFor="new-user-role">
                    Account type
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="new-user-role"
                    onChange={(event) => {
                      const role = event.target.value;
                      if (isProfileRole(role)) {
                        setInviteRole(role);
                        if (role === "tutor") {
                          setInviteCourseId("");
                        }
                      }
                    }}
                    value={inviteRole}
                  >
                    <option value="student">Student</option>
                    <option value="tutor">Tutor</option>
                  </select>
                  {inviteRole === "student" && (
                    <>
                      <label className="block text-sm text-slate-300" htmlFor="new-user-course">
                        Course (optional)
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        id="new-user-course"
                        onChange={(event) => setInviteCourseId(event.target.value)}
                        value={inviteCourseId}
                      >
                        <option value="">Do not assign a course yet</option>
                        {data.courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <button
                    className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                    disabled={isSendingInvitation || !inviteEmail.trim()}
                    type="submit"
                  >
                    {isSendingInvitation ? "Sending..." : `Send ${inviteRole} invitation`}
                  </button>
                </form>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Add an existing account</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Use this for someone who already has a sign-in account. They do not need to submit an account request.
                </p>
                <form className="mt-4 space-y-3" onSubmit={(event) => void addUser(event)}>
                  <label className="block text-sm text-slate-300" htmlFor="existing-user-email">
                    User email
                  </label>
                  <input
                    autoComplete="email"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="existing-user-email"
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    required
                    type="email"
                    value={newUserEmail}
                  />
                  <label className="block text-sm text-slate-300" htmlFor="existing-user-role">
                    Account type
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="existing-user-role"
                    onChange={(event) => {
                      const role = event.target.value;
                      if (isProfileRole(role)) {
                        setNewUserRole(role);
                        if (role === "tutor") {
                          setNewUserCourseId("");
                        }
                      }
                    }}
                    value={newUserRole}
                  >
                    <option value="student">Student</option>
                    <option value="tutor">Tutor</option>
                  </select>
                  {newUserRole === "student" && (
                    <>
                      <label className="block text-sm text-slate-300" htmlFor="existing-user-course">
                        Course (optional)
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                        id="existing-user-course"
                        onChange={(event) => setNewUserCourseId(event.target.value)}
                        value={newUserCourseId}
                      >
                        <option value="">Do not assign a course yet</option>
                        {data.courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <button
                    className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                    disabled={isCreatingProfile || !newUserEmail.trim()}
                    type="submit"
                  >
                    {isCreatingProfile ? "Adding..." : `Add ${newUserRole}`}
                  </button>
                </form>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">New account requests</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Review the user’s message, then create their account. Assign a course when adding a student.
                </p>
                {data.requests.length ? (
                  <ul className="mt-4 space-y-4">
                    {data.requests.map((request) => (
                      <li key={request.user_id} className="rounded-lg border border-slate-800 p-3">
                        <p className="break-all font-medium">{request.email}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-sky-300">
                          Requested {request.requested_role}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                          {request.message}
                        </p>
                        {request.requested_role === "student" && (
                          <label className="mt-3 block text-sm text-slate-300">
                            Course assignment (optional)
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                              onChange={(event) =>
                                setRequestCourseIds((current) => ({
                                  ...current,
                                  [request.user_id]: event.target.value,
                                }))
                              }
                              value={requestCourseIds[request.user_id] ?? ""}
                            >
                              <option value="">No course yet</option>
                              {data.courses.map((course) => (
                                <option key={course.id} value={course.id}>{course.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                          disabled={isCreatingProfile}
                          onClick={() =>
                            void createProfile(
                              request.email,
                              request.requested_role,
                              requestCourseIds[request.user_id] ?? "",
                            )
                          }
                          type="button"
                        >
                          {isCreatingProfile ? "Adding..." : `Add ${request.requested_role}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">There are no pending account requests.</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Define a course</h2>
                <form className="mt-4 space-y-3" onSubmit={(event) => void createCourse(event)}>
                  <label className="block text-sm text-slate-300" htmlFor="course-name">
                    Course name
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="course-name"
                    maxLength={120}
                    onChange={(event) => setCourseName(event.target.value)}
                    required
                    value={courseName}
                  />
                  <label className="block text-sm text-slate-300" htmlFor="course-description">
                    Description (optional)
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="course-description"
                    maxLength={2000}
                    onChange={(event) => setCourseDescription(event.target.value)}
                    rows={3}
                    value={courseDescription}
                  />
                  <button
                    className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                    disabled={isSavingCourse || !courseName.trim()}
                    type="submit"
                  >
                    {isSavingCourse ? "Creating..." : "Create course"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Assign a course to a student</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Each student receives a separate section for each course.
                </p>
                <form className="mt-4 space-y-3" onSubmit={(event) => void assignStudent(event)}>
                  <label className="block text-sm text-slate-300" htmlFor="assign-course">
                    Course
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="assign-course"
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    required
                    value={selectedCourseId}
                  >
                    <option value="">Select a course</option>
                    {data.courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </select>
                  <label className="block text-sm text-slate-300" htmlFor="assign-student">
                    Student
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    id="assign-student"
                    onChange={(event) => setSelectedStudentId(event.target.value)}
                    required
                    value={selectedStudentId}
                  >
                    <option value="">Select a student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.email ?? student.id}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                    disabled={
                      isAssigningStudent ||
                      !selectedCourseId ||
                      !selectedStudentId
                    }
                    type="submit"
                  >
                    {isAssigningStudent ? "Assigning..." : "Create student section"}
                  </button>
                </form>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Courses</h2>
                {data.courses.length ? (
                  <ul className="mt-3 space-y-3">
                    {data.courses.map((course) => (
                      <li key={course.id} className="flex items-start justify-between gap-3 border-t border-slate-800 pt-3">
                        <div className="min-w-0">
                          <p className="font-medium">{course.name}</p>
                          {course.description && (
                            <p className="mt-1 text-sm text-slate-400">{course.description}</p>
                          )}
                        </div>
                        <button
                          className="shrink-0 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/60"
                          onClick={() => void deleteCourse(course)}
                          type="button"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No courses have been created.</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">Students and tutors</h2>
                {data.profiles.filter(({ role }) => role !== "admin").length ? (
                  <ul className="mt-3 divide-y divide-slate-800">
                    {data.profiles
                      .filter(({ role }) => role !== "admin")
                      .map((profile) => (
                        <li key={profile.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="break-all text-sm font-medium">
                              {profile.email ?? profile.id}
                            </p>
                            <p className="mt-1 text-xs capitalize text-slate-400">{profile.role}</p>
                          </div>
                          <button
                            className="shrink-0 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/60"
                            onClick={() => void deleteProfile(profile)}
                            type="button"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No students or tutors have been added.</p>
                )}
              </section>
            </div>

            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Student course sections</h2>
              <p className="mt-1 text-sm text-slate-400">
                Assign a tutor independently for each student/course combination.
              </p>
              {data.sections.length ? (
                <ul className="mt-4 divide-y divide-slate-800">
                  {data.sections.map((section) => {
                    const course = courseById.get(section.course_id);
                    const student = profileById.get(section.student_id);
                    const tutor = section.tutor_id
                      ? profileById.get(section.tutor_id)
                      : null;
                    return (
                      <li key={section.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{course?.name ?? "Course unavailable"}</p>
                          <p className="mt-1 break-all text-sm text-slate-400">
                            Student: {student?.email ?? "email unavailable"}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            Tutor: {tutor?.email ?? "unassigned"}
                          </p>
                        </div>
                        <label className="text-sm text-slate-300">
                          Assign tutor
                          <select
                            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                            onChange={(event) =>
                              void assignTutor(section.id, event.target.value || null)
                            }
                            value={section.tutor_id ?? ""}
                          >
                            <option value="">Unassigned</option>
                            {tutors.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.email ?? candidate.id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="self-end rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 hover:bg-red-950/60"
                          onClick={() => void deleteAssignment(section)}
                          type="button"
                        >
                          Delete assignment
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-5 text-sm text-slate-400">
                  No student sections yet. Create one by assigning a course to a student.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className="mt-8">
            <Link className="text-sm text-sky-300" href="/">Return to sign in</Link>
          </div>
        )}
      </div>
    </main>
  );
}
