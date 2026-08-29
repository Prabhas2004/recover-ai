import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/*
 * =========================================================
 * RECOVERAI DEMO PROXY
 * =========================================================
 *
 * Authentication is currently bypassed so the RecoverAI
 * dashboard opens directly.
 *
 * This is suitable for development / demo mode.
 *
 * When real authentication is ready, we can restore
 * Supabase authentication protection here.
 */

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  /*
   * -------------------------------------------------------
   * PUBLIC / STATIC FILES
   * -------------------------------------------------------
   *
   * Always allow Next.js assets and API routes.
   */

  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.match(
      /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/
    )
  ) {
    return NextResponse.next();
  }

  /*
   * -------------------------------------------------------
   * DIRECT DASHBOARD ACCESS
   * -------------------------------------------------------
   *
   * No login redirect.
   * No authentication check.
   *
   * Visiting:
   *
   * http://localhost:3000
   *
   * will directly open the dashboard.
   */

  return NextResponse.next();
}

/*
 * Apply proxy to application routes.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};