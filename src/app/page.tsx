
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearLoginMode, setLoginMode } from "@/lib/auth/login-mode";

type UserRole = "admin" | "tutor" | "student";
type SignInRole = UserRole;

const signInRoles: {
  value: SignInRole;
  label: string;
  Icon: typeof BookOpen;
}[] = [
  { value: "student", label: "Student", Icon: BookOpen },
  { value: "tutor", label: "Tutor", Icon: GraduationCap },
  { value: "admin", label: "Admin", Icon: ShieldCheck },
];

function isUserRole(role: string): role is UserRole {
  return role === "admin" || role === "tutor" || role === "student";
}

export default function Home() {
  const router = useRouter();
  const [role, setRole] = useState<SignInRole>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [signedInAs, setSignedInAs] = useState<UserRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setErrorMessage("");
    clearLoginMode();
    setIsSubmitting(true);

    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("role", role);

      const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.toString() },
      });

      if (error) {
        setErrorMessage(`Unable to start Google sign-in: ${error.message}`);
        setIsSubmitting(false);
      }
    } catch (error: unknown) {
      console.error("Unable to start Google sign-in", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error prevented Google sign-in. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    clearLoginMode();
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) {
        setErrorMessage(signInError.message);
        return;
      }

      if (!data.user) {
        setErrorMessage("Sign-in succeeded without a user account. Please try again.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_tutor")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile || !isUserRole(profile.role)) {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "local",
        });
        const reason = profileError
          ? `We couldn't verify your account role: ${profileError.message}`
          : "We couldn't find a valid role for your account. Please contact an administrator.";
        setErrorMessage(
          signOutError
            ? `${reason} We also couldn't end the sign-in session: ${signOutError.message}`
            : reason,
        );
        return;
      }

      const hasSelectedRole =
        profile.role === role ||
        (role === "tutor" &&
          profile.role === "admin" &&
          profile.is_tutor === true);
      if (!hasSelectedRole) {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "local",
        });
        const reason = `This account is registered as a ${profile.role}. Choose the matching sign-in option.`;
        setErrorMessage(
          signOutError
            ? `${reason} We also couldn't end the sign-in session: ${signOutError.message}`
            : reason,
        );
        return;
      }

      setLoginMode(role);
      setSignedInAs(role);
      router.push(role === "admin" ? "/admin" : "/courses");
    } catch (error: unknown) {
      console.error("Unable to sign in", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error prevented sign-in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        setErrorMessage(`Unable to sign out: ${error.message}`);
        return;
      }

      clearLoginMode();
      setSignedInAs(null);
      setPassword("");
    } catch (error: unknown) {
      console.error("Unable to sign out", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error prevented sign-out. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-5 py-12 text-slate-900">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-900/5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[#142d4e] p-12 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border border-white/10" />
          <div className="relative">
            <div className="mb-12 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <GraduationCap aria-hidden="true" size={26} />
            </div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">
              GPS Tutor
            </p>
            <h1 className="max-w-sm text-4xl font-semibold leading-tight tracking-tight">
              A clearer path to learning.
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-blue-100/80">
              Sign in to continue your tutoring journey, wherever it takes you.
            </p>
          </div>
          <p className="relative text-sm text-blue-100/60">
            Learn together. Make progress.
          </p>
        </section>

        <section className="px-6 py-10 sm:px-12 sm:py-14">
          <div className="mx-auto max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#142d4e] text-white">
                <GraduationCap aria-hidden="true" size={24} />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#142d4e]">
                GPS Tutor
              </p>
            </div>

            {signedInAs ? (
              <div className="py-8">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <LockKeyhole aria-hidden="true" size={25} />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  You&apos;re signed in
                </h2>
                <p className="mt-2 text-slate-600">
                  Your {signedInAs} account has been verified.
                </p>
                <p className="mt-1 break-all text-sm text-slate-500">{email}</p>
                <Link
                  className="mt-8 flex w-full justify-center rounded-xl bg-[#183b60] px-4 py-3 font-semibold text-white transition hover:bg-[#102d4d]"
                  href={signedInAs === "admin" ? "/admin" : "/courses"}
                >
                  {signedInAs === "admin"
                    ? "Continue to administration"
                    : "Select a course"}
                </Link>
                <button
                  className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={handleSignOut}
                  type="button"
                >
                  {isSubmitting ? "Signing out..." : "Sign out"}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-[#386b9a]">
                  WELCOME BACK
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Sign in to your account
                </h2>
                <p className="mt-2 text-slate-600">
                  Choose your account type, then enter your details.
                </p>

                <div
                  aria-label="Sign-in account type"
                  className="mt-8 grid grid-cols-3 gap-2"
                  role="group"
                >
                  {signInRoles.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      aria-pressed={role === value}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-medium transition ${
                        role === value
                          ? "border-[#386b9a] bg-blue-50 text-[#204c76]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      onClick={() => setRole(value)}
                      disabled={isSubmitting}
                      type="button"
                    >
                      <Icon aria-hidden="true" size={18} />
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={handleGoogleSignIn}
                  type="button"
                >
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.64 5.93c4.47-4.13 7.13-10.2 7.13-17.58Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.64-5.93c-2.13 1.43-4.86 2.28-8.26 2.28-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
                    />
                  </svg>
                  {isSubmitting ? "Connecting to Google..." : "Continue with Google"}
                </button>

                <div className="my-6 flex items-center gap-4">
                  <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    or use email
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-slate-700"
                      htmlFor="email"
                    >
                      Email address
                    </label>
                    <input
                      autoComplete="email"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#386b9a] focus:ring-4 focus:ring-blue-100"
                      id="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      type="email"
                      value={email}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-slate-700"
                      htmlFor="password"
                    >
                      Password
                    </label>
                    <input
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#386b9a] focus:ring-4 focus:ring-blue-100"
                      id="password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                      type="password"
                      value={password}
                      disabled={isSubmitting}
                    />
                  </div>

                  {errorMessage && (
                    <p
                      aria-live="polite"
                      className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    className="w-full rounded-xl bg-[#183b60] px-4 py-3.5 font-semibold text-white transition hover:bg-[#102d4d] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "Signing in..." : `Sign in as ${role}`}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm leading-6 text-slate-500">
                  Don&apos;t have an account? Ask your administrator to set one
                  up.
                </p>
              </>
            )}

            {signedInAs && errorMessage && (
              <p
                aria-live="polite"
                className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
