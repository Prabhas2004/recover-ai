"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [recoverySession, setRecoverySession] =
    useState(false);

  useEffect(() => {
    let mounted = true;

    async function initializeRecovery() {
      /*
        Check the current session.

        A password recovery link creates a temporary
        authenticated session. That session is exactly
        what we need to update the password.
      */
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setRecoverySession(true);
        setChecking(false);
      } else {
        /*
          No session yet. Supabase may still be processing
          the recovery event, so listen for it below.
        */
        setChecking(false);

        setError(
          "This password reset link is invalid or has expired. Please request a new reset email."
        );
      }
    }

    initializeRecovery();

    /*
      Listen specifically for the PASSWORD_RECOVERY event.
    */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (
          event === "PASSWORD_RECOVERY" &&
          session
        ) {
          setRecoverySession(true);
          setError("");
          setChecking(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleUpdatePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters long."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!recoverySession) {
      setError(
        "Your password reset session is no longer valid. Please request a new reset link."
      );
      return;
    }

    setLoading(true);

    try {
      const {
        error: updateError,
      } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(
        "Password updated successfully. Redirecting to login..."
      );

      /*
        Sign out the recovery session so the user
        must authenticate with the new password.
      */
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error(
        "Password update error:",
        error
      );

      setError(
        "Something went wrong while updating your password. Please try again."
      );

      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
            ↗
          </div>

          <h1 className="text-2xl font-bold">
            RecoverAI
          </h1>

          <p className="mt-3 text-slate-400">
            Verifying password reset link...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
            ↗
          </div>

          <h1 className="text-3xl font-bold">
            RecoverAI
          </h1>

          <p className="mt-2 text-slate-400">
            Secure password recovery
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">

          <h2 className="text-2xl font-bold">
            Create a new password
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Choose a new password for your RecoverAI
            account.
          </p>

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-400">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-400">
              {success}
            </div>
          )}

          {recoverySession && !success && (
            <form
              onSubmit={handleUpdatePassword}
              className="mt-8 space-y-5"
            >

              {/* New password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  New password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Enter new password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Minimum 8 characters.
                </p>
              </div>

              {/* Confirm password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Confirm new password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
                />
              </div>

              {/* Update */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Updating password..."
                  : "Update password"}
              </button>

            </form>
          )}

          {/* Invalid session */}
          {!recoverySession && !success && (
            <button
              type="button"
              onClick={() =>
                router.replace("/login")
              }
              className="mt-6 w-full rounded-xl border border-slate-700 px-4 py-3 font-medium text-slate-300 transition hover:bg-slate-900"
            >
              Back to login
            </button>
          )}

          {/* Footer */}
          <div className="mt-6 border-t border-slate-800 pt-5 text-center">
            <p className="text-xs text-slate-500">
              Your password is securely managed by Supabase.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}