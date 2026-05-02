import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components ("use client").
 * Reads the anon key — never expose the service role key here.
 *
 * Currently untyped. Once the migration runs against the live project,
 * regenerate types with:
 *   npx supabase gen types typescript --project-id oaufkjqtjecffpkcwewp \
 *     --schema public > lib/types/database.ts
 * and reintroduce the generic: createBrowserClient<Database>(...)
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
