import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function createClient(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, response };
}

/*
  GET /api/profile

  Returns the currently logged-in user's profile.
*/
export async function GET(request: NextRequest) {
  try {
    const { supabase, response } = createClient(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, business_name, full_name, email, created_at, updated_at"
      )
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        {
          success: false,
          error: "Profile not found",
          details: profileError.message,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        profile,
      },
      {
        status: 200,
        headers: response.headers,
      }
    );
  } catch (error) {
    console.error("Profile GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/*
  PATCH /api/profile

  Updates the currently logged-in user's profile.

  Allowed fields:
  - business_name
  - full_name
*/
export async function PATCH(request: NextRequest) {
  try {
    const { supabase, response } = createClient(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    let body: {
      business_name?: unknown;
      full_name?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON request body",
        },
        { status: 400 }
      );
    }

    const businessName =
      typeof body.business_name === "string"
        ? body.business_name.trim()
        : undefined;

    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : undefined;

    if (businessName === undefined && fullName === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Nothing to update",
        },
        { status: 400 }
      );
    }

    if (businessName !== undefined && businessName.length > 120) {
      return NextResponse.json(
        {
          success: false,
          error: "Business name must be 120 characters or less",
        },
        { status: 400 }
      );
    }

    if (fullName !== undefined && fullName.length > 120) {
      return NextResponse.json(
        {
          success: false,
          error: "Full name must be 120 characters or less",
        },
        { status: 400 }
      );
    }

    const updates: {
      business_name?: string;
      full_name?: string;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (businessName !== undefined) {
      updates.business_name = businessName;
    }

    if (fullName !== undefined) {
      updates.full_name = fullName;
    }

    const { data: profile, error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select(
        "id, business_name, full_name, email, created_at, updated_at"
      )
      .single();

    if (updateError) {
      console.error("Profile update error:", updateError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not update profile",
          details: updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        profile,
        message: "Profile updated successfully",
      },
      {
        status: 200,
        headers: response.headers,
      }
    );
  } catch (error) {
    console.error("Profile PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}