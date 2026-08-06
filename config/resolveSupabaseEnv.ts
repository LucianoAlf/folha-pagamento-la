import { SUPABASE_ANON_KEY_DEFAULT, SUPABASE_PROJECT_URL } from './supabaseDefaults.ts';

export function resolveSupabaseUrl(): string {
  const env = (import.meta as ImportMeta & {
    env?: {
      VITE_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_URL?: string;
      SUPABASE_URL?: string;
    };
  }).env;
  return (
    env?.VITE_SUPABASE_URL ||
    env?.NEXT_PUBLIC_SUPABASE_URL ||
    env?.SUPABASE_URL ||
    SUPABASE_PROJECT_URL
  );
}

export function resolveSupabaseAnonKey(): string {
  const env = (import.meta as ImportMeta & {
    env?: {
      VITE_SUPABASE_ANON_KEY?: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }).env;
  return (
    env?.VITE_SUPABASE_ANON_KEY ||
    env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env?.SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY_DEFAULT
  );
}
