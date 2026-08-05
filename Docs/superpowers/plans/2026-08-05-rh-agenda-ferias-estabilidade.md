# Plano de implementação — estabilidade da Agenda RH e Férias

## 1. Contratos falhos primeiro

- Criar teste estático para a nova migration.
- Criar runner PostgreSQL efêmero e fixture transacional cobrindo limpeza, triggers e agregação sem fanout.
- Adicionar teste unitário que prova o adiamento do callback de autenticação.
- Atualizar o contrato do badge para exigir a leitura dedicada de contadores.
- Executar os testes e registrar as falhas esperadas.

## 2. Migration

- Recriar `v_ferias_colaboradores_status` usando agregações independentes.
- Criar `ferias_badge_contadores()` com ACLs explícitas.
- Criar função e triggers de limpeza dos espelhos da Agenda.
- Executar a limpeza por anti-join somente nos dois tipos de vínculo RH.
- Manter a migration idempotente, sem IDs produtivos fixos.

## 3. Cliente

- Exportar um agendador cancelável para callbacks de autenticação.
- Usá-lo em `subscribeAuthState`, cancelando pendências no unsubscribe.
- Adicionar `feriasService.fetchBadgeCounts()` e fazer o hook consumir apenas a RPC dedicada.
- Manter `fetchColaboradoresStatus()` para a página completa de Férias.

## 4. Verificação local

- Rodar testes unitários e estáticos relevantes.
- Rodar a fixture PostgreSQL efêmera.
- Rodar typecheck e build.
- Subir preview e testar Jornada RH, Agenda e Férias com sessão autenticada.

## 5. Produção

- Repetir preflight de órfãs/válidas e totais incorretos.
- Aplicar a migration pelo Supabase.
- Validar zero órfãs e preservação das 39 válidas.
- Validar contagens corrigidas da view e RPC do badge.
- Commitar e enviar a `main`.
- Confirmar deploy Vercel e fazer smoke autenticado final.
