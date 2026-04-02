# Relatorio E2E Browser - Jornada RH V2

Data: `2026-04-01`

## 1. Resumo executivo

O modulo `Jornada RH` esta visualmente avancado e com boa cobertura funcional de superficie, mas **nao esta pronto para producao operacional sem ressalvas**. As 8 abas principais carregam, a navegacao geral existe e ha massa real suficiente para validar parte importante do fluxo. Porem, durante a homologacao E2E surgiram inconsistencias relevantes entre o estado exibido na UI e o estado real dos processos, alem de um erro funcional importante na abertura de documento oficial gerado no desligamento.

O principal risco operacional observado foi em `Desligamentos`: o processo aparece `Concluido`, mas ainda e contado como `ativo`, e o botao `Abrir` do documento oficial nao abriu o arquivo; tecnicamente, a acao disparou requisicao de signed URL que retornou `400`. Tambem houve inconsistencias recorrentes de contexto nas KPIs de `Onboarding`, `Desligamentos` e `Templates`, onde a tela mostra um item selecionado, mas os cards continuam informando `No processo selecionado` ou `No template selecionado`.

Na aba `Templates`, a operacao visivel esta centrada em templates de `recrutamento`, `onboarding` e `desligamento`; nao encontrei exposicao clara de `templates de PDI`, apesar de isso fazer parte do escopo homologado esperado. Em `Desenvolvimento`, as KPIs mostraram sinais de agregacao inconsistente: a tela exibe varios colaboradores sem plano visivel, mas o card `Sem PDI` mostra apenas `2`.

Conclusao QA: **pronto com ressalvas** para continuidade de homologacao interna, mas **nao pronto para go-live operacional pleno** enquanto os bugs de estado e o erro de abertura documental nao forem corrigidos.

## 2. Ambiente testado

- Aplicacao: `http://localhost:3000/`
- Modulo: `Jornada RH`
- Metodo: homologacao manual end-to-end com browser agent
- Perfil logado: `Luciano Alf`
- Escopo validado: `Dashboard`, `Candidatos`, `Onboarding`, `Colaboradores`, `Desenvolvimento / PDI`, `Desligamentos`, `Documentos`, `Templates`
- Restricoes respeitadas:
  - sem alteracao de codigo
  - sem migration
  - sem correcao
  - apenas teste, evidencia e documentacao

## 3. Resultado por aba

| Aba | Resultado | Observacao |
| --- | --- | --- |
| `Dashboard` | Parcial | Aba existe e abre, mas a evidencia coletada mostrou carregamento inicial e nao foi possivel concluir uma revalidacao profunda dos numeros sem ambiguidade de estado. |
| `Candidatos` | Parcial | Lista, selecao e modal de edicao funcionam; validacao de obrigatoriedade do nome apareceu corretamente. Nao foi reexecutado ciclo completo novo-candidato -> aprovacao nesta rodada. |
| `Onboarding` | Parcial | Processo e timeline carregam, mas KPIs mostram contexto inconsistente (`No processo selecionado`) mesmo com processo selecionado. |
| `Colaboradores` | Parcial | Lista e painel lateral carregam; faltou uma rodada mais profunda de dossie documental e timeline por colaborador com massa focada. |
| `Desenvolvimento / PDI` | Parcial | Tela principal e modal de novo plano abrem, mas KPIs aparentam inconsistencia e nao houve evidencia clara de templates PDI operacionais na UI. |
| `Desligamentos` | Falha relevante | Processo carrega, mas KPI de ativos conta processo concluido e o documento oficial gerado nao abriu. |
| `Documentos` | Parcial | Inbox central carregou com documentos reais, botoes de revisao/visualizacao existem; validacao profunda de filtros por origem ficou incompleta. |
| `Templates` | Falha relevante | Estrutura base existe, mas ha inconsistencias de contexto nas KPIs e nao ha exposicao clara de templates PDI no fluxo visivel. |

## 4. Resultado por fluxo E2E

| Fluxo | Status | Observacao |
| --- | --- | --- |
| `recrutamento -> onboarding` | Parcial | Evidencias visuais de candidato e onboarding materializado existem, mas a transicao nao foi reexecutada do zero nesta rodada. |
| `onboarding -> jornada ativa` | Parcial | Ha evidencias de jornada/colaborador, mas a validacao ponta a ponta ficou limitada por inconsistencias de estado nas telas analiticas. |
| `jornada -> PDI` | Parcial | A aba `Desenvolvimento` abre e permite iniciar fluxo de plano, porem as KPIs e a ausencia visivel de templates PDI impedem homologacao forte. |
| `PDI -> checkpoint/agenda` | Nao homologado | Nao houve execucao completa nesta rodada; dependencia de baseline mais confiavel na aba `Desenvolvimento`. |
| `carreira -> promocao/movimentacao` | Parcial | CTA de movimentacao existe em `Colaboradores`, mas nao foi executada criacao real nesta rodada. |
| `desligamento -> encerramento` | Parcial com falha | Processo concluido e documento gerado aparecem, mas a abertura do documento falhou. |

## 5. Bugs encontrados

### BUG-RH-001

- ID do bug: `BUG-RH-001`
- Titulo curto: `Documento oficial do desligamento nao abre`
- Severidade: `alto`
- Tipo: `funcional`
- Modulo/aba: `Desligamentos`
- Passos para reproduzir:
  1. Acessar `Jornada RH`
  2. Abrir a aba `Desligamentos`
  3. Selecionar o processo `HML Desligamento - Professor de Piano`
  4. Na caixa de `Dados do desligamento`, clicar em `Abrir`
- Resultado esperado:
  - o PDF oficial gerado deve abrir em nova aba ou no mesmo contexto com URL assinada valida
- Resultado atual:
  - nenhum documento abriu na UI; tecnicamente, a acao disparou requisicao de signed URL que retornou `400`
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/09-desligamentos-geral.png`
- Observacao tecnica:
  - apos o clique, a rede registrou `POST 400` em `storage/v1/object/sign/.../aviso-previo-indenizado.pdf`, indicando falha na geracao/uso da URL assinada

### BUG-RH-002

- ID do bug: `BUG-RH-002`
- Titulo curto: `KPI de ativos contabiliza processo concluido`
- Severidade: `medio`
- Tipo: `fluxo`
- Modulo/aba: `Desligamentos`
- Passos para reproduzir:
  1. Acessar `Jornada RH`
  2. Abrir `Desligamentos`
  3. Observar o card superior `Ativos`
  4. Comparar com o unico processo visivel na lista, que esta `Concluido` com `100%`
- Resultado esperado:
  - processos concluidos nao devem ser contabilizados como ativos
- Resultado atual:
  - a KPI mostra `1` desligamento aberto/ativo enquanto o processo exibido esta concluido
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/09-desligamentos-geral.png`
- Observacao tecnica:
  - ha indicio de query/view contabilizando status terminal como ativo ou usando filtro defasado

### BUG-RH-003

- ID do bug: `BUG-RH-003`
- Titulo curto: `KPIs de contexto nao sincronizam com item selecionado`
- Severidade: `medio`
- Tipo: `UX`
- Modulo/aba: `Onboarding`, `Desligamentos`, `Templates`
- Passos para reproduzir:
  1. Acessar `Onboarding` ou `Desligamentos` e selecionar um processo visivel
  2. Observar os cards superiores
  3. Repetir em `Templates` com um template selecionado
- Resultado esperado:
  - o texto contextual do card deve refletir que existe um processo/template selecionado
- Resultado atual:
  - mesmo com item selecionado, os cards continuam exibindo `No processo selecionado` ou `No template selecionado`
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/04-onboarding-geral.png`
  - `Docs/rh-jornada-v2-e2e-screenshots/07-templates-geral.png`
  - `Docs/rh-jornada-v2-e2e-screenshots/09-desligamentos-geral.png`
- Observacao tecnica:
  - comportamento sugere estado derivado dos cards desacoplado do item efetivamente selecionado no painel principal

### BUG-RH-004

- ID do bug: `BUG-RH-004`
- Titulo curto: `Templates de PDI nao estao expostos operacionalmente`
- Severidade: `alto`
- Tipo: `fluxo`
- Modulo/aba: `Templates`
- Passos para reproduzir:
  1. Acessar `Jornada RH`
  2. Abrir `Templates`
  3. Verificar o catalogo disponivel e a estrutura operacional exposta
- Resultado esperado:
  - o modulo deveria expor claramente templates usados para `PDI / Desenvolvimento`, conforme escopo funcional esperado
- Resultado atual:
  - a UI evidencia apenas templates de `Recrutamento`, `Onboarding` e `Desligamento`; nao ha fluxo claro/visivel de templates PDI
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/07-templates-geral.png`
- Observacao tecnica:
  - pode existir suporte de backend/seeds, mas a exposicao operacional na interface nao ficou clara nem homologavel nesta rodada

### BUG-RH-005

- ID do bug: `BUG-RH-005`
- Titulo curto: `KPIs de Desenvolvimento aparentam agregacao inconsistente`
- Severidade: `medio`
- Tipo: `funcional`
- Modulo/aba: `Desenvolvimento / PDI`
- Passos para reproduzir:
  1. Acessar `Jornada RH`
  2. Abrir `Desenvolvimento`
  3. Observar a lista lateral de colaboradores
  4. Comparar com os cards superiores, especialmente `Sem PDI`
- Resultado esperado:
  - as KPIs devem refletir de forma coerente a lista visivel e o estado dos colaboradores sem plano
- Resultado atual:
  - a tela exibe varios colaboradores com `0 plano(s)`/sem plano visivel, mas o card `Sem PDI` mostra apenas `2`
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/06-desenvolvimento-geral.png`
- Observacao tecnica:
  - pode haver diferenca entre universo filtrado da KPI e a lista visual, mas a interface nao deixa esse recorte claro

### BUG-RH-006

- ID do bug: `BUG-RH-006`
- Titulo curto: `Carga inicial do modulo ainda passa sensacao de tela nao pronta`
- Severidade: `baixo`
- Tipo: `performance`
- Modulo/aba: `Dashboard`
- Passos para reproduzir:
  1. Entrar em `Jornada RH`
  2. Observar a tela inicial imediatamente apos acesso
- Resultado esperado:
  - o modulo deveria abrir com estado pronto ou skeletons mais claros para leitura operacional
- Resultado atual:
  - a evidencia inicial coletada mostra tela escura com loading central, sem contexto operacional imediato
- Screenshot:
  - `Docs/rh-jornada-v2-e2e-screenshots/01-dashboard-geral.png`
- Observacao tecnica:
  - nao e um travamento, mas causa percepcao de lentidao e reduz confianca em uso frequente

## 6. Gaps operacionais percebidos

- A homologacao desta rodada nao encontrou um fluxo evidente e claro de `templates de PDI` na aba `Templates`.
- A aba `Colaboradores` tem volume alto de pessoas e, na tela validada, nao expunha busca/filtro dedicado, o que tende a dificultar operacao real.
- Em varias telas, os cards sinteticos parecem usar uma fonte de estado diferente do painel principal, o que reduz confianca operacional.
- O modulo exibe boa cobertura visual, mas parte da homologacao forte depende de KPIs e bindings estarem confiaveis; hoje ainda ha sinais de “estado bonito, mas ambíguo”.
- Nao houve validacao forte de filtros por origem (`candidato`, `onboarding`, `colaborador`, `desligamento`) no inbox documental nesta rodada.

## 7. Avaliacao final

- `Pronto para producao`: nao
- `Pronto com ressalvas`: sim
- `Nao pronto`: para go-live pleno, ainda nao

Veredito final: **pronto com ressalvas para continuar homologacao interna, mas nao pronto para producao operacional completa**.

## 8. Top 10 correcoes prioritarias

1. Corrigir a abertura do documento oficial em `Desligamentos` e eliminar o `POST 400` na geracao/uso da signed URL.
2. Ajustar as queries/KPIs para que processos `Concluidos` nao sejam contados como `Ativos`.
3. Sincronizar o estado dos cards superiores com o item realmente selecionado em `Onboarding`, `Desligamentos` e `Templates`.
4. Expor claramente `templates de PDI` na interface ou remover a ambiguidade entre backend suportado e operacao real.
5. Revisar as KPIs de `Desenvolvimento / PDI`, especialmente `Sem PDI`, para refletir o mesmo universo exibido na lista.
6. Melhorar o estado inicial de carregamento do `Dashboard` para reduzir percepcao de tela vazia/lenta.
7. Tornar explicitamente visivel o recorte de cada KPI quando ele nao representar toda a lista da tela.
8. Adicionar busca e/ou filtros operacionais na aba `Colaboradores`.
9. Reexecutar a homologacao forte dos fluxos `PDI -> checkpoint/agenda` e `carreira -> movimentacao` apos estabilizar as KPIs.
10. Fazer uma rodada final de QA operacional com massa dedicada e limpa para evitar ambiguidade entre dados historicos e dados da sessao.

## Evidencias salvas

- Relatorio: `Docs/rh-jornada-v2-e2e-browser-report.md`
- Screenshots: `Docs/rh-jornada-v2-e2e-screenshots/`
