# Relatorio E2E Browser - Revalidacao Jornada RH V2

Data: `2026-04-01`

## 1. Resumo executivo

A revalidacao mostrou evolucao real nas correcoes visuais e de contexto do modulo `Jornada RH`, mas o pacote de correcoes **ainda nao pode ser considerado 100% aprovado**. Em `Onboarding`, os cards superiores passaram a refletir corretamente o processo selecionado e o KPI de `Ativos` deixou de contar o processo concluido como ativo. Em `Templates`, agora existe governanca explicita no topo e a exposicao de `template de PDI em foco`, o que resolve o principal gap visual da rodada anterior.

O problema mais importante que permanece aberto esta em `Desligamentos`: o KPI de `Ativos` foi corrigido, mas o fluxo de abrir o documento oficial continua falhando. O clique em `Abrir` nao abriu nova aba nem arquivo visivel, e a rede registrou novamente `POST 400` no endpoint de signed URL do storage. Isso mantem um bloqueio operacional relevante no encerramento documental.

Na aba `Desenvolvimento / PDI`, a revalidacao ainda encontrou incoerencia visual forte entre a lista de colaboradores exibida e a logica esperada da KPI `Sem PDI`. A tela continua mostrando muitos colaboradores com `0 plano(s)`/sem plano visivel, o que nao transmite confianca de que a KPI esteja corretamente representada para operacao.

Conclusao objetiva desta rodada: parte relevante das correcoes foi aplicada com sucesso, mas **o modulo ainda fica reprovado para aceite pleno desta rodada** por causa do fluxo documental de desligamento e da KPI de `Sem PDI` ainda ambigua.

## 2. Ambiente testado

- Aplicacao: `http://localhost:3000/`
- Modulo: `Jornada RH`
- Metodo: revalidacao manual end-to-end com browser
- Massa utilizada: `HML` existente no sistema
- Perfil logado: `Luciano Alf`
- Restricoes respeitadas:
  - sem alteracao de codigo
  - sem migration
  - sem correcao
  - apenas teste, screenshot e documentacao

## 3. Resultado por correcao validada

### 3.1 Desligamentos - KPI de ativos

- Status: `aprovado`
- Severidade: `baixo`
- Passos executados:
  1. Abrir `Jornada RH`
  2. Acessar a aba `Desligamentos`
  3. Selecionar o processo `HML Desligamento - Professor de Piano`
  4. Comparar o card `Ativos` com o status do processo exibido
- Resultado observado:
  - o card `Ativos` passou a mostrar `0`
  - o processo visivel permanece `Concluido`, sem ser contado como ativo
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/01-desligamentos-visao-geral.png`
- Bugs remanescentes, se houver:
  - nenhum neste item especifico

### 3.2 Desligamentos - abertura do documento oficial

- Status: `reprovado`
- Severidade: `alto`
- Passos executados:
  1. Abrir a aba `Desligamentos`
  2. Selecionar o processo `HML Desligamento - Professor de Piano`
  3. Localizar a secao de documento oficial gerado
  4. Clicar em `Abrir`
  5. Verificar abertura visual do arquivo e comportamento de rede
- Resultado observado:
  - o clique nao abriu nova aba nem PDF visivel
  - nao houve feedback visual util para o usuario
  - a revalidacao de rede mostrou novamente `POST 400` para a signed URL do arquivo `aviso-previo-indenizado.pdf`
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/02-desligamentos-documento-gerado.png`
- Bugs remanescentes, se houver:
  - `BUG-RH-RV-001`: documento oficial gerado continua sem abrir

### 3.3 Onboarding - KPI de ativos

- Status: `aprovado`
- Severidade: `baixo`
- Passos executados:
  1. Abrir a aba `Onboarding`
  2. Selecionar o onboarding `HML Onboarding - Professor de Piano`
  3. Observar os cards superiores
  4. Comparar o KPI `Ativos` com o status do processo selecionado
- Resultado observado:
  - o card `Ativos` mostra `0`
  - o processo visivel esta `Concluido`
  - nao ha mais contagem indevida de processo concluido como ativo
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/03-onboarding-visao-geral.png`
- Bugs remanescentes, se houver:
  - nenhum neste item especifico

### 3.4 Onboarding - card de contexto do item selecionado

- Status: `aprovado`
- Severidade: `baixo`
- Passos executados:
  1. Abrir `Onboarding`
  2. Selecionar um onboarding existente
  3. Verificar se o card contextual superior reflete o item selecionado
- Resultado observado:
  - o card de contexto superior passou a exibir `HML Onboarding - Professor de Piano`
  - nao apareceu mais o texto generico `No processo selecionado`
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/04-onboarding-cards-contexto.png`
- Bugs remanescentes, se houver:
  - nenhum neste item especifico

### 3.5 Templates - exposicao operacional de templates de PDI

- Status: `aprovado`
- Severidade: `baixo`
- Passos executados:
  1. Abrir a aba `Templates`
  2. Verificar o topo da tela e a area de governanca
  3. Confirmar se existe exposicao clara de PDI na interface
  4. Inspecionar a area do template PDI carregado
- Resultado observado:
  - agora existe uma faixa de governanca no topo
  - a UI mostra explicitamente `Template de PDI em foco`
  - o valor exibido foi `PDI Professor Base`
  - o snapshot da tela tambem mostrou a secao operacional de `Novo template PDI` e o template `PDI Professor Base`
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/05-templates-visao-geral.png`
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/07-templates-contexto-governanca.png`
- Bugs remanescentes, se houver:
  - nenhum bloqueador neste item

Resposta objetiva:

- Os templates de PDI agora estao operacionalmente expostos? `sim`

### 3.6 Templates - card/contexto superior

- Status: `aprovado`
- Severidade: `baixo`
- Passos executados:
  1. Abrir `Templates`
  2. Selecionar um template operacional
  3. Observar a faixa superior de governanca/contexto
- Resultado observado:
  - o contexto superior deixou de ser ambiguo
  - a tela mostra `Desligamento Padrão` como item em foco e, ao lado, `Template de PDI em foco`
  - nao apareceu o texto generico `No template selecionado`
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/05-templates-visao-geral.png`
- Bugs remanescentes, se houver:
  - nenhum neste item especifico

### 3.7 Desenvolvimento / PDI - coerencia da KPI `Sem PDI`

- Status: `reprovado`
- Severidade: `medio`
- Passos executados:
  1. Abrir a aba `Desenvolvimento`
  2. Observar a lista de colaboradores
  3. Conferir o estado aparente de planos na lista
  4. Revalidar a coerencia esperada da KPI `Sem PDI`
- Resultado observado:
  - a lista continua exibindo um volume grande de colaboradores com `0 plano(s)` e sem plano visivel
  - a interface ainda nao transmite confianca de que a KPI `Sem PDI` esteja alinhada com o universo que a lista mostra
  - a revalidacao desta rodada nao encontrou evidencia visual forte de que esse problema tenha sido resolvido
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/08-desenvolvimento-visao-geral.png`
- Bugs remanescentes, se houver:
  - `BUG-RH-RV-002`: KPI `Sem PDI` continua visualmente ambigua/incoerente com a lista

Resposta objetiva:

- A KPI `Sem PDI` agora parece consistente com a tela? `nao`

### 3.8 Cards de contexto - consolidado

- Status: `aprovado com ressalvas`
- Severidade: `baixo`
- Passos executados:
  1. Selecionar item real em `Onboarding`
  2. Selecionar item real em `Desligamentos`
  3. Abrir `Templates` e observar a governanca superior
- Resultado observado:
  - `Onboarding`: contexto corrigido e refletindo o item selecionado
  - `Desligamentos`: contexto superior e KPI de etapas agora refletem o processo HML selecionado
  - `Templates`: contexto superior agora explicita item em foco e template PDI em foco
- Screenshot associada:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/01-desligamentos-visao-geral.png`
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/04-onboarding-cards-contexto.png`
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/05-templates-visao-geral.png`
- Bugs remanescentes, se houver:
  - nenhum bug direto de contexto permaneceu nesta rodada

## 4. Bugs remanescentes

### BUG-RH-RV-001

- Titulo: `Documento oficial de desligamento continua sem abrir`
- Severidade: `alto`
- Comportamento observado:
  - o clique em `Abrir` nao gera abertura visual do PDF
  - a rede registrou novamente `POST 400` no endpoint de signed URL do storage
- Evidencia:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/02-desligamentos-documento-gerado.png`

### BUG-RH-RV-002

- Titulo: `KPI Sem PDI continua visualmente incoerente`
- Severidade: `medio`
- Comportamento observado:
  - a tela de `Desenvolvimento` ainda exibe muitos colaboradores com `0 plano(s)`/sem plano visivel
  - a KPI `Sem PDI` segue sem demonstrar coerencia clara com o que o usuario ve
- Evidencia:
  - `Docs/rh-jornada-v2-e2e-revalidation-screenshots/08-desenvolvimento-visao-geral.png`

## 5. Veredito final

- `corrigido e aprovado`: nao
- `corrigido com ressalvas`: parcialmente
- `ainda reprovado`: sim

Veredito final desta rodada: **ainda reprovado**.

Motivo:

- houve correcao real de `Onboarding`, `Templates` e dos cards de contexto
- mas o fluxo principal de abertura do documento oficial em `Desligamentos` continua falhando
- e a KPI `Sem PDI` continua sem confianca visual suficiente para aceite

## 6. Recomendacao objetiva

- `pronto para Ana usar amanha`: nao
- `pronto com cautela`: nao, por causa do fluxo documental de desligamento ainda quebrado
- `ainda nao pronto`: sim

Recomendacao objetiva: **ainda nao pronto**.

## Evidencias salvas

- Relatorio: `Docs/rh-jornada-v2-e2e-browser-revalidation-report.md`
- Screenshots: `Docs/rh-jornada-v2-e2e-revalidation-screenshots/`
