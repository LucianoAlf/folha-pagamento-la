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
- `[-]` Resumo executivo da jornada do colaborador implantado, mas sem chamada autenticada homologada manualmente

## Seguranca e Infra
- `[x]` Migracoes base de RH
- `[x]` Migracao V2 de jornada e PDI
- `[x]` Migracao V2 de templates de PDI e carreira
- `[x]` Migracao complementar da Agenda para `rh_pdi_checkpoint`
- `[x]` Bucket privado `rh-documentos`
- `[x]` RLS nas tabelas novas
- `[-]` QA real de permissoes por papel nos modulos V2

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
- `[-]` QA completo por perfil (`rh`, `gestor`, `mentor`, `avaliador`, `financeiro`) - base atual ainda possui apenas `admin`
- `[-]` QA manual da IA do desenvolvimento com chamada autenticada e feedbacks reais

## Massa controlada ativa
- `[x]` Candidato `HML Candidato Jornada`
- `[x]` Colaborador `HML Colaborador Jornada`
- `[x]` Processo de recrutamento homologado
- `[x]` Processo de onboarding homologado
- `[x]` Jornada ativa criada e encerrada no ciclo completo
- `[x]` PDI com template, competencias, objetivos, checkpoints, feedback e evidencia
- `[x]` Movimentacao de carreira para `Professor Pleno`
- `[x]` Desligamento homologado com documento gerado
