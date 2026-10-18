"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearLoginMode, getLoginMode } from "@/lib/auth/login-mode";

type CourseRole = "student" | "tutor";
type Section = {
  id: string;
  course_id: string;
  student_id: string;
};
type Course = { id: string; name: string };
type Profile = { id: string; email: string | null };
type CourseOption = Section & { courseName: string; studentEmail: string | null };

function isCourseRole(value: unknown): value is CourseRole {
  return value === "student" || value === "tutor";
}

export default function CourseSelection() {
  const [role, setRole] = useState<CourseRole | null>(null);
  const [options, setOptions] = useState<CourseOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCourses(): Promise<void> {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        throw new Error(`Unable to verify your sign-in: ${authError.message}`);
      }
      if (!user) {
        throw new Error("Sign in before selecting a course.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_tutor")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        throw new Error(`Unable to verify your account role: ${profileError.message}`);
      }
      const loginMode = getLoginMode();
      const selectedRole =
        loginMode === "student" && profile?.role === "student"
          ? "student"
          : loginMode === "tutor" &&
              (profile?.role === "tutor" ||
                (profile?.role === "admin" && profile.is_tutor === true))
            ? "tutor"
            : null;
      if (!profile || !selectedRole || !isCourseRole(selectedRole)) {
        throw new Error("Sign in again and choose an account type that matches your profile.");
      }

      const sectionColumn =
        selectedRole === "student" ? "student_id" : "tutor_id";
      const { data: sections, error: sectionsError } = await supabase
        .from("course_sections")
        .select("id, course_id, student_id")
        .eq(sectionColumn, user.id)
        .order("created_at", { ascending: true });
      if (sectionsError) {
        throw new Error(`Unable to load your course assignments: ${sectionsError.message}`);
      }
      const sectionRows = (sections ?? []) as Section[];
      const courseIds = [...new Set(sectionRows.map(({ course_id }) => course_id))];
      const studentIds = [...new Set(sectionRows.map(({ student_id }) => student_id))];

      const [{ data: courses, error: coursesError }, profilesResult] =
        await Promise.all([
          courseIds.length
            ? supabase.from("courses").select("id, name").in("id", courseIds)
            : Promise.resolve({ data: [], error: null }),
          selectedRole === "tutor" && studentIds.length
            ? supabase.from("profiles").select("id, email").in("id", studentIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
      if (coursesError) {
        throw new Error(`Unable to load course names: ${coursesError.message}`);
      }
      if (profilesResult.error) {
        throw new Error(`Unable to load student details: ${profilesResult.error.message}`);
      }

      const courseNames = new Map(
        ((courses ?? []) as Course[]).map(({ id, name }) => [id, name]),
      );
      const studentEmails = new Map(
        ((profilesResult.data ?? []) as Profile[]).map(({ id, email }) => [
          id,
          email,
        ]),
      );
      const availableOptions = sectionRows.flatMap((section) => {
        const courseName = courseNames.get(section.course_id);
        if (!courseName) {
          return [];
        }
        return [
          {
            ...section,
            courseName,
            studentEmail: studentEmails.get(section.student_id) ?? null,
          },
        ];
      });

      if (active) {
        setRole(selectedRole);
        setOptions(availableOptions);
      }
    }

    loadCourses()
      .catch((error: unknown) => {
        console.error("Unable to load course selection", error);
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your course assignments.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-slate-100">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">
          GPS Tutor
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Select a course</h1>
        <p className="mt-2 text-sm text-slate-400">
          You can only enter a course section assigned to your account.
        </p>

        {isLoading ? (
          <p aria-live="polite" className="mt-8 text-sm text-slate-300" role="status">
            Loading your course assignments...
          </p>
        ) : errorMessage ? (
          <div className="mt-6">
            <p className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200" role="alert">
              {errorMessage}
            </p>
            <Link className="mt-4 inline-block text-sm text-sky-300" href="/">
              Return to sign in
            </Link>
          </div>
        ) : options.length ? (
          <ul className="mt-8 space-y-3">
            {options.map((option) => (
              <li key={option.id}>
                <Link
                  className="block rounded-xl border border-slate-700 bg-slate-950/60 p-4 transition hover:border-sky-500 hover:bg-slate-800"
                  href={`/session/${option.id}`}
                >
                  <span className="block font-medium">{option.courseName}</span>
                  {role === "tutor" && (
                    <span className="mt-1 block text-sm text-slate-400">
                      Student: {option.studentEmail ?? "email unavailable"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <p className="text-sm text-slate-200">
              No courses are assigned to your account yet.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Ask an administrator to assign you to a course section.
            </p>
          </div>
        )}

        <button
          className="mt-8 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          onClick={() => void signOut()}
          type="button"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
