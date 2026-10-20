"use client";


import styles from "./AdminDashboard.module.css";
import { useEffect, useState, type SubmitEvent } from "react";
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

  async function createCourse(event: SubmitEvent<HTMLFormElement>): Promise<void> {
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

  async function assignStudent(event: SubmitEvent<HTMLFormElement>): Promise<void> {
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

  async function addUser(event: SubmitEvent<HTMLFormElement>): Promise<void> {
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

  async function inviteUser(event: SubmitEvent<HTMLFormElement>): Promise<void> {
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
    <main className={styles.utility_eaf5adca}>
      <div className={styles.utility_adc5ca27}>
        <header className={styles.utility_cbd9f2f1}>
          <div>
            <p className={styles.utility_2c8d53d4}>
              GPS Tutor administration
            </p>
            <h1 className={styles.utility_ca837c1f}>Manage users and courses</h1>
            <p className={styles.utility_fdc10ac3}>
              Admin accounts cannot enter tutoring sessions. Sign out and sign in as a tutor to tutor a student.
            </p>
          </div>
          <button
            className={styles.utility_6561ade5}
            onClick={() => void signOut()}
            type="button"
          >
            Sign out
          </button>
        </header>

        {errorMessage && (
          <p className={styles.utility_c037e214} role="alert">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className={styles.utility_62959d3b} role="status">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p aria-live="polite" className={styles.utility_834b8477} role="status">
            Loading administration data...
          </p>
        ) : data ? (
          <div className={styles.utility_83a91963}>
            <div className={styles.utility_b3542e05}>
              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Invite a new student or tutor</h2>
                <p className={styles.utility_fdc10ac3}>
                  Send an automated invitation email. The account and optional course assignment are created after the user accepts.
                </p>
                <form className={styles.utility_5383c0c9} onSubmit={(event) => void inviteUser(event)}>
                  <label className={styles.utility_1cdb1037} htmlFor="new-user-email">
                    Email
                  </label>
                  <input
                    autoComplete="email"
                    className={styles.utility_c6d0cafc}
                    id="new-user-email"
                    onChange={(event) => setInviteEmail(event.target.value)}
                    required
                    type="email"
                    value={inviteEmail}
                  />
                  <label className={styles.utility_1cdb1037} htmlFor="new-user-role">
                    Account type
                  </label>
                  <select
                    className={styles.utility_c6d0cafc}
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
                      <label className={styles.utility_1cdb1037} htmlFor="new-user-course">
                        Course (optional)
                      </label>
                      <select
                        className={styles.utility_c6d0cafc}
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
                    className={styles.utility_afc25fe3}
                    disabled={isSendingInvitation || !inviteEmail.trim()}
                    type="submit"
                  >
                    {isSendingInvitation ? "Sending..." : `Send ${inviteRole} invitation`}
                  </button>
                </form>
              </section>

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Add an existing account</h2>
                <p className={styles.utility_fdc10ac3}>
                  Use this for someone who already has a sign-in account. They do not need to submit an account request.
                </p>
                <form className={styles.utility_5383c0c9} onSubmit={(event) => void addUser(event)}>
                  <label className={styles.utility_1cdb1037} htmlFor="existing-user-email">
                    User email
                  </label>
                  <input
                    autoComplete="email"
                    className={styles.utility_c6d0cafc}
                    id="existing-user-email"
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    required
                    type="email"
                    value={newUserEmail}
                  />
                  <label className={styles.utility_1cdb1037} htmlFor="existing-user-role">
                    Account type
                  </label>
                  <select
                    className={styles.utility_c6d0cafc}
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
                      <label className={styles.utility_1cdb1037} htmlFor="existing-user-course">
                        Course (optional)
                      </label>
                      <select
                        className={styles.utility_c6d0cafc}
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
                    className={styles.utility_afc25fe3}
                    disabled={isCreatingProfile || !newUserEmail.trim()}
                    type="submit"
                  >
                    {isCreatingProfile ? "Adding..." : `Add ${newUserRole}`}
                  </button>
                </form>
              </section>

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>New account requests</h2>
                <p className={styles.utility_fdc10ac3}>
                  Review the user’s message, then create their account. Assign a course when adding a student.
                </p>
                {data.requests.length ? (
                  <ul className={styles.utility_c52b72f5}>
                    {data.requests.map((request) => (
                      <li key={request.user_id} className={styles.utility_a7077373}>
                        <p className={styles.utility_6ea1cadb}>{request.email}</p>
                        <p className={styles.utility_3b0e002d}>
                          Requested {request.requested_role}
                        </p>
                        <p className={styles.utility_0ec212a0}>
                          {request.message}
                        </p>
                        {request.requested_role === "student" && (
                          <label className={styles.utility_1c5ef6e8}>
                            Course assignment (optional)
                            <select
                              className={styles.utility_22042e41}
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
                          className={styles.utility_a57ceea5}
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
                  <p className={styles.utility_771662c5}>There are no pending account requests.</p>
                )}
              </section>

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Define a course</h2>
                <form className={styles.utility_5383c0c9} onSubmit={(event) => void createCourse(event)}>
                  <label className={styles.utility_1cdb1037} htmlFor="course-name">
                    Course name
                  </label>
                  <input
                    className={styles.utility_c6d0cafc}
                    id="course-name"
                    maxLength={120}
                    onChange={(event) => setCourseName(event.target.value)}
                    required
                    value={courseName}
                  />
                  <label className={styles.utility_1cdb1037} htmlFor="course-description">
                    Description (optional)
                  </label>
                  <textarea
                    className={styles.utility_c6d0cafc}
                    id="course-description"
                    maxLength={2000}
                    onChange={(event) => setCourseDescription(event.target.value)}
                    rows={3}
                    value={courseDescription}
                  />
                  <button
                    className={styles.utility_afc25fe3}
                    disabled={isSavingCourse || !courseName.trim()}
                    type="submit"
                  >
                    {isSavingCourse ? "Creating..." : "Create course"}
                  </button>
                </form>
              </section>

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Assign a course to a student</h2>
                <p className={styles.utility_fdc10ac3}>
                  Each student receives a separate section for each course.
                </p>
                <form className={styles.utility_5383c0c9} onSubmit={(event) => void assignStudent(event)}>
                  <label className={styles.utility_1cdb1037} htmlFor="assign-course">
                    Course
                  </label>
                  <select
                    className={styles.utility_c6d0cafc}
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
                  <label className={styles.utility_1cdb1037} htmlFor="assign-student">
                    Student
                  </label>
                  <select
                    className={styles.utility_c6d0cafc}
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
                    className={styles.utility_afc25fe3}
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

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Courses</h2>
                {data.courses.length ? (
                  <ul className={styles.utility_d827a466}>
                    {data.courses.map((course) => (
                      <li key={course.id} className={styles.utility_1ee340f4}>
                        <div className={styles.utility_7e0b7cdf}>
                          <p className={styles.utility_2689f395}>{course.name}</p>
                          {course.description && (
                            <p className={styles.utility_fdc10ac3}>{course.description}</p>
                          )}
                        </div>
                        <button
                          className={styles.utility_cc6ff7a3}
                          onClick={() => void deleteCourse(course)}
                          type="button"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.utility_771662c5}>No courses have been created.</p>
                )}
              </section>

              <section className={styles.utility_4504467b}>
                <h2 className={styles.utility_85884072}>Students and tutors</h2>
                {data.profiles.filter(({ role }) => role !== "admin").length ? (
                  <ul className={styles.utility_1858bd21}>
                    {data.profiles
                      .filter(({ role }) => role !== "admin")
                      .map((profile) => (
                        <li key={profile.id} className={styles.utility_2bf61eb6}>
                          <div className={styles.utility_7e0b7cdf}>
                            <p className={styles.utility_7172a051}>
                              {profile.email ?? profile.id}
                            </p>
                            <p className={styles.utility_48608392}>{profile.role}</p>
                          </div>
                          <button
                            className={styles.utility_cc6ff7a3}
                            onClick={() => void deleteProfile(profile)}
                            type="button"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className={styles.utility_771662c5}>No students or tutors have been added.</p>
                )}
              </section>
            </div>

            <section className={styles.utility_4504467b}>
              <h2 className={styles.utility_85884072}>Student course sections</h2>
              <p className={styles.utility_fdc10ac3}>
                Assign a tutor independently for each student/course combination.
              </p>
              {data.sections.length ? (
                <ul className={styles.utility_e0a31eb0}>
                  {data.sections.map((section) => {
                    const course = courseById.get(section.course_id);
                    const student = profileById.get(section.student_id);
                    const tutor = section.tutor_id
                      ? profileById.get(section.tutor_id)
                      : null;
                    return (
                      <li key={section.id} className={styles.utility_6cecaf04}>
                        <div className={styles.utility_7e0b7cdf}>
                          <p className={styles.utility_aa8a5029}>{course?.name ?? "Course unavailable"}</p>
                          <p className={styles.utility_ee84350e}>
                            Student: {student?.email ?? "email unavailable"}
                          </p>
                          <p className={styles.utility_74b8c061}>
                            Tutor: {tutor?.email ?? "unassigned"}
                          </p>
                        </div>
                        <label className={styles.utility_d3a0966d}>
                          Assign tutor
                          <select
                            className={styles.utility_22042e41}
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
                          className={styles.utility_ed9e7c2c}
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
                <p className={styles.utility_25967cd7}>
                  No student sections yet. Create one by assigning a course to a student.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className={styles.utility_4e5d2af5}>
            <Link className={styles.utility_59ad6d1d} href="/">Return to sign in</Link>
          </div>
        )}
      </div>
    </main>
  );
}
