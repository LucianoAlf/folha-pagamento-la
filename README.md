<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LA Music - Folha de Pagamento

Sistema de folha de pagamento da LA Music Group (Dashboard, Lançamentos, Comparativo com IA e Colaboradores) usando Supabase.

## Run Locally

**Prerequisites:** Node.js

1. Instale as dependências:
   `npm install`

2. Crie um arquivo `.env.local` na raiz do projeto:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Exemplo:
   `VITE_SUPABASE_URL=https://ubdvtjbitozhkuvvqkxj.supabase.co`
   `VITE_SUPABASE_ANON_KEY=...`

3. Rode o projeto:
   `npm run dev`

## Segurança (produção)

- Habilitar Supabase Auth e desabilitar Sign Ups.
- Ajustar políticas RLS para `authenticated` (já aplicado via migration).
- Nunca expor `GEMINI_API_KEY` no frontend (deve ficar apenas na Edge Function).
