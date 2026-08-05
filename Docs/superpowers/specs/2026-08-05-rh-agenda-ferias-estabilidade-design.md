# Estabilidade RH: Agenda sem órfãs e Férias sem travamento

## Objetivo

Eliminar somente os espelhos quebrados da Jornada RH na Agenda, impedir novas órfãs e corrigir o badge e os totais de Férias sem alterar processos válidos da Ana.

## Evidência produtiva

- `tarefas` possui 62 espelhos RH: 39 válidos e 23 órfãos.
- As 23 órfãs foram criadas em 01/04/2026: 19 `rh_etapa` e 4 `rh_processo`.
- Os títulos pertencem a uma validação de migration, aos recrutamentos de Carlos Silva e Maria Santos e ao onboarding antigo de Alan Samico. Nenhum pai referenciado ainda existe.
- A consulta direta da view de Férias executa em aproximadamente 0,5 ms e devolve 21 colaboradores.
- O navegador reproduz o timeout do badge em 20 segundos, enquanto o log da API registra `200` logo no início da chamada.
- A assinatura de autenticação inicia uma nova leitura Supabase dentro de `onAuthStateChange`, padrão que pode bloquear chamadas subsequentes no cliente.
- A view une diretamente períodos e programações, formando produto cartesiano por colaborador. Em produção, Neuza aparece com 84 períodos vencidos em vez de 6 e Ana com 6 em vez de 2.

## Desenho aprovado

### 1. Integridade Agenda/Jornada

- Uma migration remove somente tarefas cujo `vinculo_tipo` seja `rh_processo` ou `rh_etapa` e cujo pai não exista.
- Triggers de exclusão em `rh_processos` e `rh_processo_etapas` removem seus espelhos correspondentes da Agenda.
- A função de trigger usa `SECURITY DEFINER`, `search_path` fixo e não fica executável por `public`, `anon` ou `authenticated`.
- A limpeza é idempotente e não toca tarefas genéricas, outros tipos de vínculo ou qualquer espelho com pai existente.

### 2. Agregação correta de Férias

- `v_ferias_colaboradores_status` passa a agregar `ferias_periodos_aquisitivos` e `ferias_programacoes` separadamente por colaborador antes de uni-las.
- Os nomes, tipos, semântica de nulos, `security_invoker` e privilégios atuais da view são preservados.
- Uma RPC de leitura retorna somente `vencidos` e `proximos` para o badge, sem transferir a lista completa.
- A RPC é `SECURITY INVOKER`, valida a mesma visibilidade da view e fica disponível apenas a `authenticated` e `service_role`.

### 3. Ciclo de autenticação do badge

- O listener de `onAuthStateChange` agenda a reação para depois do callback de autenticação retornar.
- Callbacks agendados são cancelados ao desmontar a store.
- O badge mantém cache por sessão, deduplicação de chamadas e descarte de respostas de sessões antigas.

## Testes e validação

- Teste estático da migration: anti-joins restritos, triggers, guardrails e ACLs.
- Fixture PostgreSQL transacional: preserva tarefa válida, remove órfã inicial e remove espelhos quando etapa ou processo é excluído.
- Fixture da view: um colaborador com vários períodos e várias programações continua com contagens exatas.
- Teste unitário do listener: nenhuma leitura começa de forma síncrona dentro do callback de autenticação; callbacks desmontados não executam.
- Build, typecheck e suíte Node.
- Preflight produtivo antes da migration: 23 órfãs e 39 válidas.
- Pós-migration: zero órfãs, 39 válidas preservadas e totais reais de Férias corrigidos.
- Navegador autenticado: badge carrega sem timeout; página de Férias mostra contagens coerentes; Jornada RH e Agenda continuam navegáveis.

## Publicação

Trabalho direto na `main`, conforme orientação vigente. A migration é aplicada somente após fixtures e build passarem. O push dispara o deploy Vercel; a conclusão exige confirmação do deployment e smoke autenticado em produção.
