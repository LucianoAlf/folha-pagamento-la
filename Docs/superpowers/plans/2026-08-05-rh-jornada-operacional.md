# Plano de implementação — Jornada RH operacional

**Objetivo:** corrigir autorização, perfis operacionais e carregamento da Jornada RH, com prova automatizada e QA real no navegador.

## 1. Fixar os contratos em testes vermelhos

**Arquivos:**
- Criar `supabase/migrations/rh_jornada_operacional.test.mjs`
- Criar `services/rhReadResilience.test.ts`
- Criar `services/rhJornadaService.operacional.test.mjs`

Cobrir: role da Ana por e-mail, perfil padrão para novos usuários, proibição de DML direto em `user_profiles`, RPC sem parâmetro de role, leitura de perfis por RH, retry somente em falhas transitórias, timeout limitado e seleção estreita de colaboradores.

## 2. Implementar a migration de autorização segura

**Arquivos:**
- Criar `supabase/migrations/20260805_1_rh_jornada_operacional.sql`
- Modificar `services/api.ts`
- Modificar `App.tsx`

Criar trigger/backfill, promover a Ana, restringir grants/policies e criar `user_profile_self_update`. Trocar o salvamento do perfil para a RPC e remover `role` do payload do navegador.

## 3. Implementar leitura resiliente para o RH

**Arquivos:**
- Criar `services/rhReadResilience.ts`
- Modificar `services/api.ts`
- Modificar `services/rhJornadaService.ts`
- Modificar, se necessário, `components/rh-jornada/tabs/OnboardingTab.tsx`
- Modificar, se necessário, `components/rh-jornada/tabs/ColaboradoresTab.tsx`

Adicionar GET com timeout/retry transitório, consulta estreita e mensagens de falha que não permaneçam em carregamento infinito.

## 4. Verificação local e fixture transacional

Executar testes novos, toda a suíte MJS, `npm run typecheck` e `npm run build`. Validar RLS simulando JWT de `user`, `rh` e `admin` dentro de transação revertida. Confirmar que usuário comum não altera role e que Ana consegue operar as tabelas RH.

## 5. Aplicar migration e fazer QA real

Aplicar apenas a migration validada no Supabase `ubdvtjbitozhkuvvqkxj`. Subir preview da branch, abrir no Simple Browser e testar Dashboard, Candidatos, Onboarding, Colaboradores, Desenvolvimento, Desligamentos, Documentos e Templates. Abrir/cancelar todos os modais; executar escritas somente em dados `TESTE CODEX RH`/HML e nunca enviar WhatsApp.

## 6. Limpeza e publicação da branch

Arquivar/remover apenas os artefatos controlados de QA, repetir testes, revisar diff e migration remota, criar um único commit intencional e fazer push de `codex/rh-jornada-operacional`. Não fazer merge.
