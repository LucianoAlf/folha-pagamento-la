# Auditoria Final - Jornada RH V2

Data da auditoria: `2026-04-01`

## Resumo executivo

Status geral do modulo:

- `Implantado e validado tecnicamente`: frontend, migrations, tabelas, views, bucket privado, funcoes RH/IA, novas abas, servicos e build
- `Homologado E2E com massa controlada`: recrutamento, onboarding, jornada, PDI, agenda, carreira e desligamento
- `Ainda dependente de QA humano real por papel`: permissoes finas e experiencia de uso em perfis operacionais

Conclusao objetiva:

- A `Jornada RH V2` esta **implantada e homologada tecnicamente de ponta a ponta**
- O sistema **ainda nao deve ser chamado de 100% homologado em producao multiusuario** enquanto nao houver QA com perfis reais

## O que foi validado nesta auditoria

### Frontend

- `[x]` O modulo RH tem 8 abas ativas:
  - `Dashboard`
  - `Candidatos`
  - `Onboarding`
  - `Colaboradores`
  - `Desenvolvimento`
  - `Desligamentos`
  - `Documentos`
  - `Templates`
- `[x]` As telas premium existem no codigo:
  - `Dossie documental`
  - `Timeline da jornada`
  - `Movimentacao de carreira`
  - `Competencias`
  - `IA da jornada`
  - `Templates de PDI`
- `[x]` O build de producao passou em `2026-04-01`
- `[-]` O bundle final continua grande e o Vite alerta sobre chunks acima de 500 kB

### Banco e Supabase

- `[x]` Tabelas RH base presentes
- `[x]` Tabelas V2 de jornada/PDI presentes
- `[x]` Tabelas V2 de templates/carreira presentes
- `[x]` Views RH presentes:
  - `v_rh_alertas_criticos`
  - `v_rh_colaborador_jornadas_resumo`
  - `v_rh_dashboard_kpis`
  - `v_rh_documentos_pendentes`
  - `v_rh_pdi_dashboard_kpis`
  - `v_rh_processos_resumo`
- `[x]` Bucket privado `rh-documentos` existe
- `[x]` RLS esta habilitado nas tabelas novas auditadas de jornada/PDI
- `[x]` Seeds premium presentes:
  - `1` template de PDI
  - `3` competencias de template
  - `3` objetivos de template
  - `3` checkpoints de template
  - `6` badges
  - `3` ciclos
  - `6` niveis de carreira
- `[x]` Constraint da Agenda atualizada para aceitar `rh_pdi_checkpoint`

### Funcoes e IA

- `[x]` `rh-ai-journey-insights` implantada e ativa
- `[x]` IA RH usa protecao compartilhada em `_shared/rh-auth.ts`
- `[x]` A protecao exige `Authorization` valido e papel `admin` ou `rh`
- `[x]` Espelhamento de checkpoint PDI para Agenda existe no service
- `[-]` Chamada autenticada real da IA ainda nao foi homologada com usuario operacional

## Homologacao assistida E2E

Foi criada uma massa controlada de homologacao no banco com o prefixo `HML`.

Fluxos validados:

- `[x]` `recrutamento -> onboarding`
- `[x]` `onboarding -> jornada ativa`
- `[x]` `jornada -> PDI`
- `[x]` `PDI -> checkpoint/agenda`
- `[x]` `carreira -> promocao/movimentacao`
- `[x]` `desligamento -> encerramento`

Provas objetivas coletadas:

- `1` candidato homologado
- `3` processos homologados:
  - recrutamento
  - onboarding
  - desligamento
- `1` jornada homologada
- `1` PDI homologado
- `1` movimentacao de carreira homologada
- `1` tarefa espelhada na Agenda com `rh_pdi_checkpoint`
- `1` documento oficial registrado em `rh_documentos_gerados`

Estado final validado:

- colaborador `inactive`
- jornada `encerrada`
- PDI `congelado`
- desligamento documental e financeiro `concluido`
- inbox documental da massa sem pendencias

## O que o banco mostra agora

Leitura da massa controlada:

- a infraestrutura esta pronta
- os templates premium foram efetivamente usados
- as views respondem corretamente
- o modulo suporta o ciclo completo da jornada

## Limitacoes reais desta auditoria

- `user_profiles` hoje tem apenas `1` usuario operacional registrado:
  - `admin: 1`
  - `rh: 0`
  - `gestor: 0`
  - `mentor: 0`
  - `avaliador: 0`
  - `financeiro: 0`
- por isso, `QA por papeis` nao pode ser validado de forma real
- a homologacao da IA foi estrutural e de deploy, nao de uso autenticado com usuario humano operacional

## Itens considerados homologados

- `[x]` Upload contextual de documentos em:
  - candidato
  - onboarding/processo
  - colaborador/dossie
  - desligamento
  - inbox central de documentos
- `[x]` Jornada do colaborador
- `[x]` PDI com:
  - plano
  - objetivos
  - competencias
  - checkpoints
  - feedbacks
  - evidencias
- `[x]` Templates de PDI
- `[x]` Movimentacao de carreira
- `[x]` Badges, marcos, conquistas e score
- `[x]` Agenda espelhada para checkpoints PDI
- `[x]` Criacao automatica/modelada de PDI por template
- `[x]` Desligamento com encerramento completo

## Itens que ainda dependem de validacao operacional humana

- `[-]` QA completo por papel
- `[-]` QA funcional de IA com usuario real
- `[-]` Revisao da UX final com a Ana em uso real

## Veredito final

Veredito desta auditoria:

- `Implantacao estrutural`: **aprovada**
- `Implantacao funcional de codigo`: **aprovada**
- `Homologacao assistida E2E`: **aprovada**
- `Homologacao operacional multiusuario`: **ainda pendente de usuarios reais**

Em outras palavras:

- **nao ficou faltando implementacao central do blueprint**
- **o ciclo completo foi validado com massa controlada**
- o que falta para chamar de `100% em producao` e a rodada humana final com perfis reais
