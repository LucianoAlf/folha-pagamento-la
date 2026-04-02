# Checklist Mestre - Jornada RH V2

Status:
- `[x]` implantado e validado
- `[-]` parcial
- `[ ]` pendente

## Operacao RH
- `[x]` Dashboard RH com KPIs operacionais
- `[x]` Candidatos com curriculo, questionario, entrevista, aula teste e aprovacao/reprovacao
- `[x]` Onboarding com etapas, checklist, avaliacoes e participantes
- `[x]` Desligamentos com geracao de documentos oficiais
- `[x]` Documentos como inbox central
- `[x]` Templates de recrutamento, onboarding e desligamento

## Refinamento operacional e CRUD
- `[x]` Documento oficial de desligamento abre com path normalizado para signed URL
- `[x]` KPI de desligamentos ativos ignora processos concluidos/cancelados
- `[x]` KPI de onboardings ativos ignora processos concluidos/cancelados
- `[x]` Cards de contexto em `Onboarding` e `Desligamentos` refletem o processo selecionado
- `[x]` Templates exibem contexto operacional e destaque visivel para templates de PDI
- `[x]` Snapshot de `Desenvolvimento / PDI` calcula `Sem PDI` com o mesmo universo de colaboradores ativos da lista
- `[x]` Documento gerado de desligamento tem recuperacao automatica: se o registro estiver órfão, o clique em `Abrir` regenera o PDF e reabre com signed URL nova
- `[x]` Edge Function `rh-generate-document` valida a persistencia real do PDF no bucket antes de gravar em `rh_documentos_gerados`
- `[x]` Aba `Desenvolvimento / PDI` explicita o universo da KPI `Sem PDI` e a lista lateral passa a ser claramente apresentada como base ativa
- `[x]` Edicao de candidato na propria operacao do pipeline
- `[x]` Arquivamento seguro de candidato com cancelamento do recrutamento ativo
- `[x]` Checklist oficial por etapa no onboarding/recrutamento
- `[x]` CRUD de checklist da etapa: inserir, editar, concluir e excluir
- `[x]` Links operacionais por item de checklist
- `[x]` Configuracao operacional da etapa com:
  - `data limite`
  - `data/hora agendada`
  - `instrucoes`
  - `modelo de mensagem`
  - `link de referencia`
  - `link de reuniao`
- `[x]` Responsaveis da etapa com:
  - `atribuir`
  - `remover`
  - `definir principal`
- `[x]` Mentor explicito no processo com atribuicao e troca
- `[x]` Documentos por etapa com:
  - `criar`
  - `enviar/trocar arquivo`
  - `visualizar`
  - `excluir`
- `[x]` Avaliacoes com:
  - `inserir`
  - `editar`
  - `excluir`
- `[x]` Dossie documental do colaborador com:
  - `inserir`
  - `revisar`
  - `visualizar`
  - `excluir`
- `[x]` Gatilho de WhatsApp por etapa para responsaveis e colaborador
- `[x]` CRUD completo do PDI na UI:
  - competencias com inserir, editar e excluir
  - objetivos com inserir, editar e excluir
  - checkpoints com inserir, editar, concluir e excluir
  - feedbacks com inserir, editar e excluir
  - evidencias com inserir, editar, substituir arquivo/link e excluir

## Desenvolvimento RH
- `[x]` Aba Colaboradores
- `[x]` Dossie documental permanente do colaborador
- `[x]` Jornada viva do colaborador
- `[x]` Aba Desenvolvimento / PDI
- `[x]` Plano, objetivos, checkpoints, feedbacks e evidencias
- `[x]` Competencias do PDI
- `[x]` Timeline da jornada
- `[x]` Movimentacoes de carreira na interface
- `[x]` Templates de PDI por cargo/trilha

## Gamificacao
- `[x]` Badges
- `[x]` Marcos
- `[x]` Conquistas
- `[x]` Score de jornada
- `[x]` Celebracao visual
- `[x]` Indicadores de pronto para promocao / travado / trilha concluida

## Automacao
- `[x]` Aprovacao de candidato gera onboarding
- `[x]` Onboarding concluido gera jornada ativa
- `[x]` Criacao automatica de PDI por template
- `[x]` Checkpoints de PDI espelhados na Agenda
- `[x]` Mudanca de nivel gera marco automatico na jornada
- `[x]` Desligamento encerra jornada ativa e congela PDI

## IA
- `[x]` Comparativo IA de candidatos
- `[x]` Resumo executivo IA do dashboard operacional
- `[x]` Resumo IA do desenvolvimento/PDI
- `[x]` Sugestao de proximos passos do PDI
- `[x]` Risco de atraso no PDI
- `[x]` Resumo executivo da jornada do colaborador implantado e homologado com chamada autenticada de RH

## Seguranca e Infra
- `[x]` Migracoes base de RH
- `[x]` Migracao V2 de jornada e PDI
- `[x]` Migracao V2 de templates de PDI e carreira
- `[x]` Migracao complementar da Agenda para `rh_pdi_checkpoint`
- `[x]` Bucket privado `rh-documentos`
- `[x]` RLS nas tabelas novas
- `[x]` Hardening multirole de RLS para RH, gestor, mentor, avaliador e financeiro
- `[x]` QA real de permissoes por papel nos modulos V2 com usuarios HML autenticados

## Homologacao Assistida E2E
- `[x]` Fluxo `recrutamento -> onboarding`
- `[x]` Fluxo `onboarding -> jornada ativa`
- `[x]` Fluxo `jornada -> PDI`
- `[x]` Fluxo `PDI -> checkpoint/agenda`
- `[x]` Fluxo `carreira -> promocao/movimentacao`
- `[x]` Fluxo `desligamento -> encerramento`
- `[x]` Views RH refletindo a massa controlada
- `[x]` Inbox documental sem pendencias na massa controlada
- `[x]` Documento oficial de desligamento registrado em `rh_documentos_gerados`

## QA
- `[x]` Build do frontend
- `[x]` Smoke tecnico de banco, views, funcoes e storage
- `[x]` Homologacao assistida com massa controlada no banco
- `[x]` QA completo por perfil (`rh`, `gestor`, `mentor`, `avaliador`, `financeiro`) com usuarios HML reais no Auth
- `[x]` QA manual da IA do desenvolvimento com chamada autenticada para `rh` e bloqueio validado para `gestor`

## Massa controlada ativa
- `[x]` Candidato `HML Candidato Jornada`
- `[x]` Colaborador `HML Colaborador Jornada`
- `[x]` Usuarios HML por papel no Auth: RH, gestor, mentor, avaliador e financeiro
- `[x]` Processo de recrutamento homologado
- `[x]` Processo de onboarding homologado
- `[x]` Jornada ativa criada e encerrada no ciclo completo
- `[x]` PDI com template, competencias, objetivos, checkpoints, feedback e evidencia
- `[x]` Movimentacao de carreira para `Professor Pleno`
- `[x]` Desligamento homologado com documento gerado
