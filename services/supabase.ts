import { createClient } from '@supabase/supabase-js';

// IMPORTANT:
// - Vite só expõe variáveis com prefixo configurado em `envPrefix`.
// - Neste projeto usamos `.env.local` com `NEXT_PUBLIC_SUPABASE_*`, então garantimos
//   compatibilidade lendo tanto `VITE_` quanto `NEXT_PUBLIC_`.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  (import.meta as any).env?.SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.SUPABASE_ANON_KEY;

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

