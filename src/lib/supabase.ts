import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getSupabase() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  client = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return client;
}

export function supabaseError(error: { message: string; code?: string }) {
  const rawMessage = error.message.replace(/^P0001:\s*/i, "");
  const message = /^Auth session missing!?$/i.test(rawMessage)
    ? "Your sign-in session has expired. Please sign in again."
    : rawMessage;
  return Object.assign(
    new Error(message || `Supabase request failed (${error.code || "unknown"}).`),
    { code: error.code },
  );
}
