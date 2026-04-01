# Homologacao Assistida - Jornada RH V2

Data: `2026-04-01`

## Objetivo

Validar de ponta a ponta os fluxos principais da Jornada RH V2 com uma massa controlada de homologacao no banco, cobrindo:

- `recrutamento -> onboarding`
- `onboarding -> jornada ativa`
- `jornada -> PDI`
- `PDI -> checkpoint/agenda`
- `carreira -> promocao/movimentacao`
- `desligamento -> encerramento`

## Correcoes aplicadas antes da homologacao

Foi aplicada a migracao complementar da Agenda para aceitar `rh_pdi_checkpoint` em `tarefas.vinculo_tipo`.

Arquivo:
- `supabase/migrations/20260401_agenda_rh_pdi_checkpoint.sql`

## Massa controlada utilizada

### Entidades principais

- Candidato: `HML Candidato Jornada`
- Colaborador: `HML Colaborador Jornada`
- Recrutamento: `22222222-2222-4222-8222-222222222222`
- Onboarding: `33333333-3333-4333-8333-333333333333`
- Jornada: `44444444-4444-4444-8444-444444444444`
- PDI: `55555555-5555-4555-8555-555555555555`
- Desligamento: `66666666-6666-4666-8666-666666666666`

### Evidencias inseridas

- curriculo de candidato
- documentos admissionais
- dossie documental permanente
- objetivos e checkpoints do PDI
- feedback e evidencia do PDI
- badge e marcos da jornada
- movimentacao de carreira
- documentos de desligamento
- documento oficial gerado em `rh_documentos_gerados`
- tarefa espelhada na Agenda para checkpoint do PDI

## Resultado por fluxo

### 1. Recrutamento -> Onboarding

Validado com sucesso.

Evidencias:
- `1` candidato homologado
- `1` processo de recrutamento concluido
- `1` processo de onboarding concluido
- `2` avaliacoes registradas no recrutamento:
  - entrevista
  - aula teste

### 2. Onboarding -> Jornada ativa

Validado com sucesso.

Evidencias:
- `1` jornada criada para o colaborador
- status inicial da jornada: `ativa`
- etapa atual inicial validada: `desenvolvimento`
- marco `onboarding_concluido` registrado

### 3. Jornada -> PDI

Validado com sucesso.

Evidencias:
- `1` plano de PDI em `em_andamento`
- `3` competencias materializadas a partir do template
- `3` objetivos materializados a partir do template
- `3` checkpoints materializados a partir do template
- `1` feedback registrado
- `1` evidencia registrada

### 4. PDI -> Checkpoint / Agenda

Validado com sucesso.

Evidencias:
- `1` checkpoint realizado
- `1` checkpoint futuro agendado
- `1` tarefa em `tarefas` com `vinculo_tipo = rh_pdi_checkpoint`
- inbox e views sem quebra apos o espelhamento

### 5. Carreira -> Promocao / Movimentacao

Validado com sucesso.

Evidencias:
- `1` movimentacao de carreira registrada
- jornada atualizada para `Professor Pleno`
- marco de `promocao` registrado
- score da jornada atualizado

### 6. Desligamento -> Encerramento

Validado com sucesso.

Evidencias:
- `1` processo de desligamento concluido
- `1` registro em `rh_desligamentos`
- `3` documentos de desligamento conferidos
- `1` documento oficial gerado
- jornada finalizada com status `encerrada`
- colaborador marcado como `inactive`
- PDI congelado

## Provas consolidadas

### Contagens validadas

- candidatos: `1`
- recrutamentos: `1`
- onboardings: `1`
- jornadas: `1`
- documentos de processo: `7`
- documentos de dossie: `2`
- pdis: `1`
- competencias: `3`
- objetivos: `3`
- checkpoints: `3`
- feedbacks: `1`
- evidencias: `1`
- conquistas: `1`
- marcos: `5`
- movimentacoes: `1`
- tarefas de agenda para checkpoint: `1`
- desligamentos: `1`
- documentos gerados: `1`

### Views validadas

- `v_rh_dashboard_kpis`
- `v_rh_pdi_dashboard_kpis`
- `v_rh_colaborador_jornadas_resumo`
- `v_rh_documentos_pendentes`

## Estado final da massa controlada

### Jornada

- status: `encerrada`
- etapa atual: `desligamento`
- score: `60`
- badges: `2`

### PDI

- status final: `congelado`
- score de progresso: `55`

### Colaborador

- `ativo = false`
- `status = inactive`
- `em_rescisao = false`

## O que esta homologado

- estrutura de banco da V2
- views
- templates de PDI
- dossie documental
- jornada do colaborador
- PDI operacional
- checkpoint espelhado na Agenda
- carreira e promocao
- desligamento com encerramento

## O que ainda depende de validacao humana real

- QA por papeis reais:
  - `rh`
  - `gestor`
  - `mentor`
  - `avaliador`
  - `financeiro`
- chamada autenticada das funcoes de IA com usuario real
- revisao funcional manual da UX com a Ana

## Conclusao

A homologacao assistida E2E da Jornada RH V2 foi concluida com sucesso no banco e nas estruturas principais do sistema.

O modulo pode ser considerado:

- `implantado`
- `validado tecnicamente`
- `homologado de ponta a ponta com massa controlada`

O unico passo restante para chamar de `100% homologado em producao` e rodar a validacao humana com usuarios reais por papel.
