"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SessionParticipantsProvider } from "@/components/SessionParticipants/SessionParticipants";
import SessionWorkspace from "@/components/SessionWorkspace/SessionWorkspace";
import SessionChat from "@/components/SessionChat/SessionChat";
import VideoInterface from "@/components/VideoInterface/VideoInterface";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getLoginMode } from "@/lib/auth/login-mode";

type SessionRole = "student" | "tutor";
type SessionDetails = {
  id: string;
  courseName: string;
  role: SessionRole;
};

function isSessionRole(value: unknown): value is SessionRole {
  return value === "student" || value === "tutor";
}

export default function SessionPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    let previousTitle: string | null = null;

    async function loadSession(): Promise<void> {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sectionId)) {
        throw new Error("This course section link is invalid.");
      }
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        throw new Error(`Unable to verify your sign-in: ${authError.message}`);
      }
      if (!user) {
        throw new Error("Sign in as the assigned student or tutor to join this session.");
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
      const sessionRole: SessionRole | null =
        profile?.role === "student" && loginMode === "student"
          ? "student"
          : loginMode === "tutor" &&
              (profile?.role === "tutor" ||
                (profile?.role === "admin" && profile.is_tutor === true))
            ? "tutor"
            : null;
      if (!profile || !sessionRole || !isSessionRole(sessionRole)) {
        throw new Error(
          "Administrator sessions cannot enter tutoring. Sign out and sign in again using the Tutor account type.",
        );
      }

      const { data: section, error: sectionError } = await supabase
        .from("course_sections")
        .select("id, course_id, student_id, tutor_id")
        .eq("id", sectionId)
        .maybeSingle();
      if (sectionError) {
        throw new Error(`Unable to verify your course assignment: ${sectionError.message}`);
      }
      if (
        !section ||
        (sessionRole === "student" && section.student_id !== user.id) ||
        (sessionRole === "tutor" && section.tutor_id !== user.id)
      ) {
        throw new Error("This course section is not assigned to your account.");
      }

      const { data: course, error: courseError } = await supabase
        .from("courses")
        .select("name")
        .eq("id", section.course_id)
        .single();
      if (courseError) {
        throw new Error(`Unable to load the course name: ${courseError.message}`);
      }
      if (active) {
        previousTitle = document.title;
        document.title = `${course.name} | GPS Tutor`;
        setSession({
          id: section.id,
          courseName: course.name,
          role: sessionRole,
        });
      }
    }

    loadSession()
      .catch((error: unknown) => {
        console.error("Unable to open tutoring session", error);
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to open this tutoring session.",
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
      if (previousTitle) {
        document.title = previousTitle;
      }
    };
  }, [sectionId]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p aria-live="polite" role="status">Loading your tutoring session...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
        <section className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Unable to open session</h1>
          <p className="mt-3 text-sm text-red-200" role="alert">
            {errorMessage || "The requested tutoring session is unavailable."}
          </p>
          <Link className="mt-5 inline-block text-sm text-sky-300" href="/">
            Return to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100">
      <header className="flex h-14 shrink-0 items-center border-b border-slate-800 bg-slate-900/50 px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-emerald-500" />
          <h1 className="truncate text-sm font-semibold text-slate-200 sm:text-base">
            {session.courseName}
          </h1>
        </div>
      </header>

      <SessionParticipantsProvider>
        <main className="grid h-[calc(100vh-3.5rem)] flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-12">
          <section className="flex h-full min-w-0 flex-col lg:col-span-8">
            <SessionWorkspace sessionId={session.id} sessionRole={session.role} />
          </section>
          <section className="flex h-full min-h-0 flex-col gap-4 lg:col-span-4">
            <div className="h-48 shrink-0">
              <VideoInterface sessionId={session.id} sessionRole={session.role} />
            </div>
            <SessionChat sessionId={session.id} sessionRole={session.role} />
          </section>
        </main>
      </SessionParticipantsProvider>
    </div>
  );
}
