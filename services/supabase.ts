import { createClient } from '@supabase/supabase-js';

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_ANON_KEY__: string | undefined;

const SUPABASE_URL = __SUPABASE_URL__ || (import.meta as any).env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__ || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase config. Define VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

