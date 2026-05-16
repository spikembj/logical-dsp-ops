import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the "middleware" file convention to "proxy" — same role,
// clearer name (it's a request interceptor, not Express-style middleware).
// The exported function and config behave identically; only the names
// changed. The supabase helper at lib/supabase/middleware.ts keeps its
// name to match Supabase's own documentation.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next internals)
     * - favicon.ico, icon files, public assets
     * Everything else hits updateSession, which decides public vs private.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
