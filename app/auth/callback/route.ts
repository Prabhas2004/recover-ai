import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  const origin = url.origin;

  // Create a safe redirect target.
  // Password recovery should ALWAYS go to reset-password.
  const redirectPath =
    type === "recovery"
      ? "/reset-password"
      : next && next.startsWith("/")
        ? next
        : "/";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=reset_failed",
        origin
      )
    );
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          },
        },
      }
    );

    const {
      error,
    } =
      await supabase.auth.exchangeCodeForSession(
        code
      );

    if (error) {
      console.error(
        "Auth callback error:",
        error.message
      );

      return NextResponse.redirect(
        new URL(
          "/login?error=reset_failed",
          origin
        )
      );
    }

    /*
      Password recovery:
      The user is now authenticated with a
      temporary recovery session.

      DO NOT send them to the dashboard.
      Send them to the password reset page.
    */
    return NextResponse.redirect(
      new URL(
        redirectPath,
        origin
      )
    );
  } catch (error) {
    console.error(
      "Auth callback exception:",
      error
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=reset_failed",
        origin
      )
    );
  }
}