"use client";


import styles from "./page.module.css";
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
      <main className={styles.utility_a88a3f2d}>
        <p aria-live="polite" role="status">Loading your tutoring session...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.utility_5134b564}>
        <section className={styles.utility_e6df4f4e}>
          <h1 className={styles.utility_08c50e80}>Unable to open session</h1>
          <p className={styles.utility_7cc012b9} role="alert">
            {errorMessage || "The requested tutoring session is unavailable."}
          </p>
          <Link className={styles.utility_a48e708d} href="/">
            Return to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.utility_a6fb0fbc}>
      <header className={styles.utility_51693a83}>
        <div className={styles.utility_be1287d2}>
          <div className={styles.utility_9b979c59} />
          <h1 className={styles.utility_17aacdb0}>
            {session.courseName}
          </h1>
        </div>
      </header>

      <SessionParticipantsProvider>
        <main className={styles.utility_5c265bec}>
          <section className={styles.utility_174c3811}>
            <SessionWorkspace sessionId={session.id} sessionRole={session.role} />
          </section>
          <section className={styles.utility_4c8c165b}>
            <div className={styles.utility_65b74a91}>
              <VideoInterface sessionId={session.id} sessionRole={session.role} />
            </div>
            <SessionChat sessionId={session.id} sessionRole={session.role} />
          </section>
        </main>
      </SessionParticipantsProvider>
    </div>
  );
}
