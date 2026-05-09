import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and gates protected
 * routes by both auth status and (for /admin/*) role.
 *
 * Important: per the @supabase/ssr docs, getUser() must be called between
 * creating the supabase client and returning the response, so that any
 * refreshed session cookies are written back to the response.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  // Unauthenticated → bounce to login (preserve intended destination).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated → gate /admin to admin role only.
  if (user && pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.active) {
      // Inactive user — sign them out and send to login with a flag.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "inactive");
      return NextResponse.redirect(url);
    }

    const managementRoles = [
      "owner",
      "hr",
      "ops_manager",
      "admin",
      "manager",
    ];
    if (!managementRoles.includes(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
