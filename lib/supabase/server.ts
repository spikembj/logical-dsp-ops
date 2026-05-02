import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads the user's session from cookies and refreshes it via middleware.
 *
 * Per-request: do NOT cache this. Always create a new instance.
 *
 * Currently untyped. After the migration runs, regenerate types with
 *   npx supabase gen types typescript --project-id oaufkjqtjecffpkcwewp \
 *     --schema public > lib/types/database.ts
 * and reintroduce the generic: createServerClient<Database>(...)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — middleware refreshes
            // the session, so this can be safely ignored.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS. Use ONLY in trusted server contexts
 * (route handlers, server actions) for operations that explicitly need to
 * skip RLS — e.g. the post-signup hook that writes the initial users row.
 *
 * Never import this from a Client Component.
 */
export function createServiceRoleClient() {
  // Intentionally not a typed client — this is for admin tasks only.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
