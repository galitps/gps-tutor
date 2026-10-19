"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearLoginMode, setLoginMode } from "@/lib/auth/login-mode";

type CallbackStatus = "checking" | "success" | "onboarding" | "pending" | "error";
type SignInRole = "tutor" | "student" | "admin";
type UserRole = SignInRole;

function isUserRole(role: string): role is UserRole {
  return role === "admin" || role === "tutor" || role === "student";
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<CallbackStatus>("checking");
  const [message, setMessage] = useState("Verifying your sign-in...");
  const [email, setEmail] = useState("");
  const [signedInRole, setSignedInRole] = useState<SignInRole | null>(null);
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") ?? params.get("error");

      if (providerError) {
        throw new Error(`Sign-in was not completed: ${providerError}`);
      }

      const selectedRole = params.get("role");
      if (
        selectedRole !== "student" &&
        selectedRole !== "tutor" &&
        selectedRole !== "admin"
      ) {
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
          "The sign-in provider did not return an active session. Please check the Supabase provider and redirect URL settings.",
        );
      }

      if (session.user.user_metadata?.gps_tutor_admin_invite === true) {
        const acceptanceResponse = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const acceptance = await acceptanceResponse.json() as {
          status?: string;
          error?: string;
        };
        if (!acceptanceResponse.ok || acceptance.status !== "accepted") {
          throw new Error(acceptance.error ?? "Unable to finish setting up your invited account.");
        }
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_tutor")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(`We couldn't verify your account role: ${profileError.message}`);
      }

      if (!profile) {
        if (selectedRole === "admin") {
          throw new Error("Administrator accounts must be provisioned by an administrator.");
        }
        const { data: request, error: requestError } = await supabase
          .from("onboarding_requests")
          .select("message")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (requestError) {
          throw new Error(`Unable to check your request status: ${requestError.message}`);
        }
        if (!cancelled) {
          clearLoginMode();
          setLoginMode(selectedRole);
          setEmail(session.user.email ?? "");
          setSignedInRole(selectedRole);
          setOnboardingMessage(request?.message ?? "");
          setMessage(
            request
              ? "Your request has been sent to the administrator. You’ll be able to continue once your account is set up."
              : "Tell the administrator what you need so they can set up your account and course assignment.",
          );
          setStatus(request ? "pending" : "onboarding");
        }
        return;
      }

      let rejectionReason: string | null = null;
      if (!isUserRole(profile.role)) {
        rejectionReason = "We couldn't find a valid role for your account. Please contact an administrator.";
      } else if (
        profile.role !== selectedRole &&
        !(
          selectedRole === "tutor" &&
          profile.role === "admin" &&
          profile.is_tutor === true
        )
      ) {
        rejectionReason = `This account is registered as a ${profile.role}. Choose the matching sign-in option.`;
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
        clearLoginMode();
        setLoginMode(selectedRole);
        setEmail(session.user.email ?? "");
        setSignedInRole(selectedRole);
        setMessage(`Your ${selectedRole} account has been verified.`);
        setStatus("success");
        router.replace(selectedRole === "admin" ? "/admin" : "/courses");
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
  }, [router]);

  async function submitOnboardingRequest(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setRequestMessage("");
    setIsSubmittingRequest(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        throw new Error(`Unable to verify your sign-in: ${authError.message}`);
      }

      if (!user || !signedInRole || signedInRole === "admin") {
        throw new Error("Sign in again as a student or tutor to submit a request.");
      }
      const { error } = await supabase.from("onboarding_requests").insert({
        user_id: user.id,
        email: user.email ?? "",
        requested_role: signedInRole,
        message: onboardingMessage.trim(),
      });
      if (error) {
        throw new Error(`Unable to send your request: ${error.message}`);
      }
      setMessage(
        "Your request has been sent to the administrator. You’ll be able to continue once your account is set up.",
      );
      setStatus("pending");
    } catch (error: unknown) {
      console.error("Unable to submit account request", error);
      setRequestMessage(
        error instanceof Error ? error.message : "Unable to send your request.",
      );
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function signOutFromPendingRequest(): Promise<void> {
    const { error } = await getSupabaseBrowserClient().auth.signOut({
      scope: "local",
    });
    if (error) {
      setRequestMessage(`Unable to sign out: ${error.message}`);
      return;
    }
    clearLoginMode();
    window.location.replace("/");
  }

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
              : status === "onboarding"
                ? "Request an account"
                : status === "pending"
                  ? "Request submitted"
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
        {status === "onboarding" && (
          <form className="mt-6 space-y-4" onSubmit={(event) => void submitOnboardingRequest(event)}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="onboarding-message">
              Message for the administrator
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#386b9a] focus:ring-4 focus:ring-blue-100"
              id="onboarding-message"
              maxLength={2000}
              onChange={(event) => setOnboardingMessage(event.target.value)}
              required
              rows={5}
              value={onboardingMessage}
            />
            {requestMessage && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {requestMessage}
              </p>
            )}
            <button
              className="w-full rounded-xl bg-[#183b60] px-5 py-3 font-semibold text-white transition hover:bg-[#102d4d] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmittingRequest || !onboardingMessage.trim()}
              type="submit"
            >
              {isSubmittingRequest ? "Sending request..." : "Send request"}
            </button>
          </form>
        )}
        {status === "pending" && onboardingMessage && (
          <blockquote className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {onboardingMessage}
          </blockquote>
        )}
        {status === "pending" && requestMessage && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {requestMessage}
          </p>
        )}
        {status === "pending" && (
          <button
            className="mt-8 inline-flex rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => void signOutFromPendingRequest()}
            type="button"
          >
            Sign out
          </button>
        )}
        {status !== "checking" &&
          status !== "onboarding" &&
          status !== "pending" && (
          <Link
            className="mt-8 inline-flex rounded-xl bg-[#183b60] px-5 py-3 font-semibold text-white transition hover:bg-[#102d4d]"
            href={
              status === "success"
                ? signedInRole === "admin"
                  ? "/admin"
                  : "/courses"
                : "/"
            }
          >
            {status === "success" ? "Continue" : "Return to sign in"}
          </Link>
        )}
      </section>
    </main>
  );
}
