
"use client";


import styles from "./page.module.css";
import { useState, type SubmitEvent } from "react";
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

function CompassRose({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
    >
      <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="32"
        cy="32"
        r="24"
        stroke="currentColor"
        strokeOpacity=".35"
        strokeWidth="1"
      />
      <path
        d="M32 5 37.5 26.5 54 10 37.5 29 59 32 37.5 34.5 54 54 34.5 37.5 32 59 29.5 37.5 10 54 26.5 34.5 5 32 26.5 29.5 10 10 29.5 26.5 32 5Z"
        fill="currentColor"
      />
      <path
        d="m32 10 3.5 18.5L51 13 35.5 30 55 32l-19.5 2L51 51 34 35.5 32 55l-2-19.5L13 51l15.5-17L9 32l19.5-2L13 13l17 15.5L32 10Z"
        fill="#93c5fd"
      />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
      <circle cx="32" cy="32" r="1.25" fill="#142d4e" />
    </svg>
  );
}

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

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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
    <main className={styles.pageLayout}>
      <div className={styles.contentGrid}>
        <section className={styles.contentSection}>
          <div className={styles.heroBackgroundGlow} />
          <div className={styles.heroBorderAccent} />
          <div className={styles.contentContainer}>
            <div className={styles.alignedRow}>
              <CompassRose className={styles.icon} />
            </div>
            <p className={styles.eyebrowLabel}>
              GPS Tutor
            </p>
            <h1 className={styles.weHelpYouReachYourGoalsHeading}>
              We help you reach your goals.
            </h1>
            <p className={styles.bodyText}>
              Sign in to continue your tutoring journey, wherever it takes you.
            </p>
          </div>
        </section>

        <section className={styles.signInPanelSection}>
          <div className={styles.signInPanel}>
            <div className={styles.brandIdentity}>
              <div className={styles.flexAlignedRow}>
                <CompassRose className={styles.brandIcon} />
              </div>
              <p className={styles.brandName}>
                GPS Tutor
              </p>
            </div>

            {signedInAs ? (
              <div className={styles.signedInAccountPanel}>
                <div className={styles.successAlignedRow}>
                  <LockKeyhole aria-hidden="true" size={25} />
                </div>
                <h2 className={styles.youReSignedInHeading}>
                  You&apos;re signed in
                </h2>
                <p className={styles.supportingText}>
                  Your {signedInAs} account has been verified.
                </p>
                <p className={styles.helperText}>{email}</p>
                <Link
                  className={styles.primaryLink}
                  href={signedInAs === "admin" ? "/admin" : "/courses"}
                >
                  {signedInAs === "admin"
                    ? "Continue to administration"
                    : "Select a course"}
                </Link>
                <button
                  className={styles.signOutButton}
                  disabled={isSubmitting}
                  onClick={handleSignOut}
                  type="button"
                >
                  {isSubmitting ? "Signing out..." : "Sign out"}
                </button>
              </div>
            ) : (
              <>
                <p className={styles.welcomeEyebrow}>
                  WELCOME BACK
                </p>
                <h2 className={styles.signInHeading}>
                  Sign in to your account
                </h2>
                <p className={styles.supportingText}>
                  Choose your account type, then enter your details.
                </p>

                <div
                  aria-label="Sign-in account type"
                  className={styles.accountTypeOptions}
                  role="group"
                >
                  {signInRoles.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      aria-pressed={role === value}
                      className={[styles.accountTypeButton, (role === value ? styles.selectedAccountType : styles.unselectedAccountTypeButton), styles.disabledAccountType].filter(Boolean).join(" ")}
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
                  className={styles.borderedSecondaryButton}
                  disabled={isSubmitting}
                  onClick={handleGoogleSignIn}
                  type="button"
                >
                  <svg aria-hidden="true" className={styles.googleIcon} viewBox="0 0 48 48">
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

                <div className={styles.emailSignInDivider}>
                  <span aria-hidden="true" className={styles.caption} />
                  <span className={styles.mutedCaption}>
                    or use email
                  </span>
                  <span aria-hidden="true" className={styles.caption} />
                </div>

                <form className={styles.formLayout} onSubmit={handleSubmit}>
                  <div>
                    <label
                      className={styles.fieldLabel}
                      htmlFor="email"
                    >
                      Email address
                    </label>
                    <input
                      autoComplete="email"
                      className={styles.formControl}
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
                      className={styles.fieldLabel}
                      htmlFor="password"
                    >
                      Password
                    </label>
                    <input
                      autoComplete="current-password"
                      className={styles.formControl}
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
                      className={styles.errorMessage}
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    className={styles.primaryButton}
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "Signing in..." : `Sign in as ${role}`}
                  </button>
                </form>

                <p className={styles.newAccountGuidance}>
                  New here? Continue with Google to send your administrator an
                  account request.
                </p>
              </>
            )}

            {signedInAs && errorMessage && (
              <p
                aria-live="polite"
                className={styles.dangerErrorMessage}
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
