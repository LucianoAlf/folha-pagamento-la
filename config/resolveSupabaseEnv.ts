import { SUPABASE_ANON_KEY_DEFAULT, SUPABASE_PROJECT_URL } from './supabaseDefaults';

export function resolveSupabaseUrl(): string {
  return (
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    (import.meta as ImportMeta & { env?: { SUPABASE_URL?: string } }).env?.SUPABASE_URL ||
    SUPABASE_PROJECT_URL
  );
}

export function resolveSupabaseAnonKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (import.meta as ImportMeta & { env?: { SUPABASE_ANON_KEY?: string } }).env?.SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY_DEFAULT
  );
}
