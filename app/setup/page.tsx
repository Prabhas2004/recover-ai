"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  business_name: string | null;
  full_name: string | null;
  email: string | null;
};

export default function SetupPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/profile", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Could not load your profile."
        );
      }

      const profile: Profile = data.profile;

      setBusinessName(profile.business_name || "");
      setFullName(profile.full_name || "");
      setEmail(profile.email || "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your profile."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const cleanBusinessName = businessName.trim();
    const cleanFullName = fullName.trim();

    if (!cleanBusinessName) {
      setError("Please enter your business name.");
      return;
    }

    if (!cleanFullName) {
      setError("Please enter your name.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business_name: cleanBusinessName,
          full_name: cleanFullName,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Could not save your profile."
        );
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl">
            ↗
          </div>

          <p className="text-slate-400">
            Loading your account...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
            ↗
          </div>

          <h1 className="text-3xl font-bold">
            Welcome to RecoverAI
          </h1>

          <p className="mt-2 text-slate-400">
            Let's set up your workspace.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
          <h2 className="text-2xl font-bold">
            Tell us about your business
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            This information will be used to personalize
            your RecoverAI dashboard.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
          >
            <div>
              <label
                htmlFor="business-name"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Business name
              </label>

              <input
                id="business-name"
                type="text"
                required
                maxLength={120}
                value={businessName}
                onChange={(event) =>
                  setBusinessName(event.target.value)
                }
                placeholder="Your company name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="full-name"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Your name
              </label>

              <input
                id="full-name"
                type="text"
                required
                maxLength={120}
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                placeholder="Your full name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Account email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                disabled
                className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-slate-500 outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Continue to RecoverAI"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-800 pt-5 text-center">
            <p className="text-xs text-slate-500">
              Your account information is securely stored.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}