import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { SUPABASE_ANON_KEY_DEFAULT, SUPABASE_PROJECT_URL } from './config/supabaseDefaults';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const supabaseUrl =
      env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || SUPABASE_PROJECT_URL;
    const supabaseAnonKey =
      env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_DEFAULT;

    return {
      // Expor apenas variáveis "publicáveis" no client (NÃO inclui GEMINI_API_KEY).
      envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Supabase URL/anon key are safe to expose to the client.
      // We intentionally do NOT expose GEMINI_API_KEY here.
      define: {
        __SUPABASE_URL__: JSON.stringify(supabaseUrl),
        __SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
