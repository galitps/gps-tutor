"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CallbackStatus = "checking" | "success" | "error";
type SignInRole = "tutor" | "student";
type UserRole = SignInRole | "admin";

function isUserRole(role: string): role is UserRole {
  return role === "admin" || role === "tutor" || role === "student";
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<CallbackStatus>("checking");
  const [message, setMessage] = useState("Verifying your Google sign-in...");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") ?? params.get("error");

      if (providerError) {
        throw new Error(`Google sign-in was not completed: ${providerError}`);
      }

      const selectedRole = params.get("role");
      if (selectedRole !== "student" && selectedRole !== "tutor") {
        throw new Error("The selected account type is missing or invalid. Please start again.");
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(`Unable to retrieve your sign-in session: ${sessionError.message}`);
      }
      if (!session?.user) {
        throw new Error(
          "Google did not return an active sign-in session. Please check the Supabase Google provider and redirect URL settings.",
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      let rejectionReason: string | null = null;
      if (profileError) {
        rejectionReason = `We couldn't verify your account role: ${profileError.message}`;
      } else if (!profile || !isUserRole(profile.role)) {
        rejectionReason =
          "We couldn't find a valid role for your account. Please contact an administrator.";
      } else if (profile.role !== selectedRole) {
        rejectionReason =
          profile.role === "admin"
            ? "Administrator accounts cannot sign in through the tutor or student screen."
            : `This account is registered as a ${profile.role}. Choose the matching sign-in option.`;
      }

      if (rejectionReason) {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "local",
        });
        if (signOutError) {
          rejectionReason += ` We also couldn't end the sign-in session: ${signOutError.message}`;
        }
        throw new Error(rejectionReason);
      }

      if (!cancelled) {
        setEmail(session.user.email ?? "");
        setMessage(`Your ${selectedRole} account has been verified.`);
        setStatus("success");
      }
    }

    completeSignIn().catch((error: unknown) => {
      console.error("Unable to complete Google sign-in", error);
      if (!cancelled) {
        setMessage(
          error instanceof Error
            ? error.message
            : "An unexpected error prevented Google sign-in. Please try again.",
        );
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-5 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#386b9a]">
          GPS Tutor
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {status === "checking"
            ? "Completing sign-in"
            : status === "success"
              ? "You’re signed in"
              : "Sign-in needs attention"}
        </h1>
        <p
          aria-live="polite"
          className={`mt-3 leading-7 ${
            status === "error" ? "text-red-700" : "text-slate-600"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
        {email && <p className="mt-2 break-all text-sm text-slate-500">{email}</p>}
        {status !== "checking" && (
          <Link
            className="mt-8 inline-flex rounded-xl bg-[#183b60] px-5 py-3 font-semibold text-white transition hover:bg-[#102d4d]"
            href="/"
          >
            {status === "success" ? "Continue" : "Return to sign in"}
          </Link>
        )}
      </section>
    </main>
  );
}
