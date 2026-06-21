import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from '../config/resolveSupabaseEnv';

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_ANON_KEY = resolveSupabaseAnonKey();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
