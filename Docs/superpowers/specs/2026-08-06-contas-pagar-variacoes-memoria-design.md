# Design — Memória operacional para variações de Contas a Pagar

**Status:** aprovado no brainstorm; aguardando revisão desta especificação antes do plano de implementação  
**Data:** 2026-08-06  
**Escopo:** Contas a Pagar, comparação mensal e alertas de variação

## Resumo

Hoje o sistema detecta variações de Contas a Pagar, mas entrega principalmente um número e um alerta. O próximo passo é permitir que o RH/financeiro explique a ocorrência no próprio alerta e que essa explicação ajude a IA em análises futuras. A experiência deve reduzir a ansiedade de “há uma diferença, descubra o que é” sem transformar uma hipótese do modelo em verdade financeira.

A solução aprovada combina duas camadas de contexto:

1. Uma justificativa ligada à variação/alerta específico, com texto livre e status operacional opcional.
2. Uma nota geral do mês, mantida como contexto para a análise do período inteiro.

A IA pode preencher um rascunho editável quando houver evidência suficiente. O rascunho não é salvo automaticamente e nunca altera os valores determinísticos. Só uma ação explícita de salvar transforma texto humano em memória reutilizável.

## Evidências auditadas antes deste design

O desenho foi baseado no código e no banco reais, com consultas somente de leitura:

- A comparação atual já calcula mês anterior, mês atual, diferença, percentual, status de item novo/removido/recorrente e `chave_referencia`.
- `ai-contas-comparativo` já usa as notas gerais de contexto e possui cache em `contas_comparativo_ai_insights`.
- `ai-contas-auditoria` já carrega `contas_anomalia_notas` no prompt e possui fallback determinístico.
- `contas_anomalia_notas` já possui `competencia_ym`, `unidade`, `anomaly_key`, `conta_id`, `nota`, `status`, autor e timestamps.
- O banco já possui as notas gerais em `folhas_mensais.contas_notas_rh` e `folhas_mensais.contas_comparativo_notas_rh`.
- Contagens observadas no projeto remoto: 8 caches de auditoria/comparativo em `contas_ai_insights`, 12 em `contas_comparativo_ai_insights` e nenhuma nota em `contas_anomalia_notas`. Portanto, o E2E não pode depender de uma justificativa histórica real já existente.
- O padrão da Folha de Pagamento confirma que memória operacional é recuperação de contexto: notas humanas são incluídas no próximo prompt. Não é fine-tuning nem alteração do modelo Gemini.

## Problema e objetivo

### Problema

Um alerta como “variação de -61% na conta de energia” é tecnicamente correto, mas não oferece um lugar claro para explicar “a leitura foi parcial”, “houve reajuste”, “a conta foi lançada em duplicidade” ou outro contexto específico. A pessoa precisa sair do alerta para outro fluxo, e a IA pode repetir a mesma dúvida em cada mês.

### Objetivos

- Mostrar a matemática da variação e a justificativa no mesmo cartão.
- Permitir texto livre como caminho principal, sem obrigar o usuário a escolher uma causa pré-definida.
- Oferecer status operacional opcional para ajudar o trabalho do mês, sem usar status como taxonomia de causas.
- Reutilizar justificativas salvas na análise posterior, sempre identificando a mesma ocorrência com segurança.
- Produzir um rascunho de justificativa editável pela IA apenas quando a base for suficiente.
- Manter valores, reconciliação e detecção como responsabilidade do cálculo determinístico.
- Funcionar mesmo que Gemini esteja indisponível.

## Fora de escopo

- Fine-tuning, treinamento contínuo ou criação de um motor genérico de regras.
- Alteração da forma como valores monetários, percentuais ou alertas são calculados.
- Categorização automática obrigatória de causas.
- Junção das tabelas de memória da Folha com as de Contas a Pagar.
- Exclusão ou reescrita dos caches e notas existentes.
- Histórico append-only completo de cada edição (pode ser uma evolução futura; neste escopo `updated_at` é a trilha atual).
- Resolver automaticamente uma variação apenas porque a IA sugeriu uma explicação.

## Decisões de produto

### Um alerta, dois contextos

O texto específico fica ligado ao alerta. A nota geral do mês continua em seu painel próprio e é enviada como contexto, não como substituto da explicação do alerta.

No cartão, a ordem visual recomendada é:

1. Nome da conta, unidade e indicador visual da variação.
2. Valor anterior, valor atual, diferença absoluta e percentual.
3. Texto “O que mudou?” com a justificativa salva, se houver.
4. Status operacional opcional: `Pendente`, `Justificada`, `Corrigir lançamento` ou `Monitorar`.
5. Rascunho da IA, quando disponível, em campo editável com indicação explícita de que é sugestão.
6. Ações `Salvar justificativa` e, quando necessário, `Descartar rascunho`.

O usuário pode salvar apenas a nota, apenas o status ou ambos. Deixar os dois vazios é válido: um alerta ainda pode permanecer aberto sem fabricar uma explicação.

### Status não é causa

Os valores acima descrevem o próximo passo operacional. Eles não significam “sazonal”, “reajuste” ou “erro de lançamento”. O sistema não deve adicionar um select de causas obrigatório nem inferir uma causa a partir do status.

Para preservar dados antigos, a leitura tratará o status legado `verificado` como equivalente visual a `Justificada`. Novas gravações usarão o nome canônico `justificada`; a migration não poderá invalidar registros legados.

### Rascunho da IA não é memória

O rascunho aparece somente como texto editável. Ele não é persistido em `contas_anomalia_notas`, não muda o status e não entra no próximo prompt até que uma pessoa o revise e salve explicitamente. Se o usuário fechar o cartão ou recarregar a página sem salvar, o rascunho desaparece.

## Arquitetura proposta

### Fonte de verdade financeira

O comparador existente continua sendo a fonte dos números. A IA recebe a comparação pronta e pode explicar a diferença, mas não pode mudar `anterior`, `atual`, `diferenca`, `percentual`, unidade, período ou classificação de item novo/removido/recorrente.

### Memória oficial

`contas_anomalia_notas` continua sendo a tabela de memória específica de Contas a Pagar. Não será criada uma segunda tabela paralela para o mesmo propósito.

Cada registro mantém:

- competência (`competencia_ym`);
- unidade;
- `anomaly_key` determinística;
- `conta_id`, quando a ocorrência tiver uma conta individual;
- nota humana;
- status operacional opcional;
- autor e `created_at`/`updated_at`.

As notas gerais continuam em `folhas_mensais.contas_notas_rh` e `folhas_mensais.contas_comparativo_notas_rh`, conforme o fluxo que já existe.

### Identidade da ocorrência

A nota só pode ser reutilizada quando a ocorrência é a mesma. A precedência de correspondência será documentada e coberta por testes:

1. `conta_id` idêntico, quando disponível e ainda válido.
2. `recorrente_modelo_id` idêntico, combinado com unidade e plano de contas, para despesas recorrentes.
3. `anomaly_key`/`chave_referencia` determinística exata como fallback.

Descrição normalizada é componente de apoio, nunca autorização para anexar uma nota a uma ocorrência ambígua. Se mais de uma conta puder corresponder, o sistema não reaproveita a nota e mostra o alerta sem justificativa anterior.

Essa regra evita que uma alteração de fornecedor, descrição ou parcelamento carregue uma explicação antiga por engano. Para item novo ou removido, a chave deve permanecer exata; não se deve procurar “a conta mais parecida”.

## Contrato de dados e migration

### Compatibilidade de status

A migration deve ampliar a validação existente de `contas_anomalia_notas.status` sem quebrar linhas antigas:

- aceitar `NULL`;
- aceitar `pendente`, `justificada`, `corrigir_lancamento` e `monitorar`;
- continuar aceitando `verificado` para leitura de legado;
- a camada de serviço normaliza `verificado` para o rótulo `Justificada` e novas gravações preferem `justificada`.

Não haverá backfill que invente causa ou reclassifique notas antigas. Se uma etapa futura quiser remover `verificado`, deverá primeiro migrar dados em uma mudança separada e auditada.

### Chaves e restrições

Antes de codar, a migration deve confirmar as restrições atuais e preservar a unicidade lógica da nota por competência, unidade e chave da ocorrência. Se a constraint existente não cobrir o caso de `conta_id`/modelo recorrente, a implementação deve usar uma estratégia determinística (constraint ou upsert com a mesma chave) sem permitir duas notas concorrentes para o mesmo alerta.

Não adicionar colunas para o rascunho da IA. O rascunho pertence à resposta transitória do insight, não ao histórico humano.

### API de leitura e gravação

O serviço de aplicação deve expor, no mínimo:

- leitura das notas específicas para a competência/unidade visíveis ao usuário;
- upsert explícito de nota/status, preservando o rascunho local em caso de erro;
- leitura da nota geral do mês já existente;
- associação da nota salva à linha determinística pelo mesmo identificador usado na comparação.

O upsert deve ser autenticado, validar competência, unidade, tamanho do texto e status permitido. Não deve aceitar `conta_id` ou chave de outra unidade/período sem conferir no servidor.

Para manter o cartão legível e evitar payloads sem limite, a nota humana terá teto de 2.000 caracteres (a UI exibirá contador e rejeitará acima do limite sem perder o texto local). O rascunho da IA terá teto de 600 caracteres; a função deve pedir concisão ao modelo e, como última proteção, truncar com indicação de encurtamento antes de enviar para a tela.

## Contrato de IA

### Entrada

`ai-contas-comparativo` e, quando aplicável, `ai-contas-auditoria` recebem:

- comparação determinística do período;
- nota geral do mês atual e do período base, se houver;
- notas específicas já salvas que correspondam à mesma ocorrência ou a uma ocorrência recorrente identificada sem ambiguidade;
- status salvo, apenas como contexto operacional;
- versão do prompt e hash de toda essa entrada.

O status nunca deve ser enviado como causa. A nota humana deve ser marcada como contexto fornecido pelo usuário.

### Saída

Cada insight pode trazer `sugestao_justificativa: string | null`. Quando não houver evidência suficiente, o valor é `null`. O prompt deve proibir linguagem de certeza, diagnóstico sobre pessoas e invenção de fatos; a sugestão deve limitar-se aos dados da comparação e às notas fornecidas.

O limite de 600 caracteres deve ser controlado no servidor antes de chegar à tela. Truncar deve preservar o início e indicar que o texto foi encurtado, em vez de quebrar o layout.

O objeto de saída também deve manter intactos os campos numéricos e a chave da ocorrência. A UI nunca deve substituir a justificativa humana salva pelo texto da IA sem uma ação de confirmação.

### Cache e invalidação

O hash de entrada precisa incluir nota específica e status salvos, além da nota geral já usada. Uma nova gravação deve tornar o cache anterior inelegível para a mesma comparação. Não é necessário apagar o cache: a versão/hash impede reutilização incorreta.

Se Gemini falhar, expirar ou devolver JSON inválido, a função retorna os insights determinísticos já disponíveis, sem rascunho, e registra apenas o erro técnico seguro. O alerta e o salvamento manual continuam utilizáveis.

## Fluxo de usuário

1. Usuário abre `Contas a Pagar` e escolhe competência/unidade.
2. O sistema carrega comparação e alertas; os números aparecem mesmo sem IA.
3. Usuário expande um alerta e lê anterior, atual, diferença e percentual.
4. Se houver nota salva, ela aparece com data/autoria; o status é mostrado como operação, não como causa.
5. Se a análise tiver base suficiente, aparece um rascunho editável identificado como “Sugestão da IA”.
6. Usuário edita ou escreve livremente, escolhe opcionalmente um status e clica em `Salvar justificativa`.
7. A tela confirma a gravação e mantém o texto mesmo se a regeneração da IA falhar.
8. Ao regenerar a análise, a nota salva é enviada como contexto e o rascunho pode ser atualizado; nenhum valor da comparação muda.
9. A nota geral do mês continua disponível separadamente para registrar contexto amplo.

## Guardrails de segurança e confiabilidade

- RLS e autorização RH/financeiro devem ser mantidos para leitura e escrita.
- A Edge Function continua sendo o limite para segredos e chamadas ao Gemini; nenhum segredo vai para o frontend.
- Sanitizar/escapar texto exibido; nota humana e saída da IA são dados, não HTML.
- Validar tamanho, competência, unidade e status no servidor.
- Não registrar em logs o texto completo se ele puder conter dados pessoais desnecessários; evitar também logar prompts completos.
- Falha de IA não bloqueia comparação, leitura nem salvamento manual.
- Falha de persistência não limpa o campo local nem apresenta “salvo”.
- A IA não pode mudar, arredondar novamente ou ocultar valores determinísticos.
- Ações de salvar precisam ser idempotentes para duplo clique/retry.
- O acesso a uma nota deve respeitar a unidade e a competência do usuário; não aceitar a chave enviada pelo cliente sem revalidar a linha correspondente.

## Plano de fatias

### Fatia 1 — contrato e persistência

- Confirmar a chave de identidade real usada por comparação e auditoria.
- Aplicar migration compatível de status/uniqueness.
- Criar ou ajustar funções de leitura/upsert com RLS e validações.
- Cobrir concorrência, legado `verificado` e chave ambígua.

### Fatia 2 — experiência operacional

- Inserir justificativa e status no cartão de alerta.
- Reaproveitar componentes de input/select já tokenizados.
- Mostrar nota salva, autor e data.
- Implementar salvar/editar/reabrir sem depender do Gemini.
- Manter a nota geral do mês como contexto separado.

### Fatia 3 — memória e rascunho da IA

- Incluir notas específicas no prompt do comparativo/auditoria.
- Acrescentar `sugestao_justificativa` nullable na resposta, sem coluna persistida.
- Incluir nota/status no hash e testar invalidação do cache.
- Adicionar fallback sem rascunho em timeout/erro.

### Fatia 4 — E2E, auditoria e publicação

- Executar fixtures controladas para variação recorrente, item novo/removido e descrição alterada.
- Validar visualmente alertas nos temas claro/escuro e em viewport estreita.
- Testar RLS, duplo clique e falha de rede.
- Parar para auditoria de código/testes, depois QA no navegador e só então publicar.

## Matriz de testes

### Comparação e identidade

- Valores anterior/atual/diferença/percentual permanecem idênticos antes e depois da justificativa.
- A mesma conta recorrente encontra a nota por `recorrente_modelo_id` mesmo que a descrição varie de forma segura.
- Uma descrição alterada sem identidade segura não herda nota.
- Item novo e item removido não herdam nota por aproximação.
- Unidade `todas` não mistura notas de unidades diferentes.
- A chave exibida no insight é a mesma usada no upsert.

### Ciclo da nota

- Abrir alerta sem nota, digitar e salvar.
- Reabrir a competência e ver texto, status, autor e data.
- Editar e salvar novamente sem criar duplicata.
- Salvar só status ou só texto.
- Fechar/recarregar com rascunho não salvo e confirmar que ele não virou memória.
- Simular erro de gravação e confirmar que o texto permanece editável.
- Duplo clique/retry produz uma única nota lógica.

### IA e cache

- Prompt contém nota específica e nota geral corretas.
- Hash muda após nota/status salvos.
- Rascunho aparece apenas quando há base suficiente.
- Rascunho é editável e não substitui nota humana automaticamente.
- Timeout, JSON inválido e chave sem correspondência retornam comparação determinística sem invenção.
- Valores numéricos e classificação não mudam após a resposta da IA.

### Segurança e browser

- Usuário sem permissão não lê nem grava notas.
- Texto é renderizado com segurança.
- Chave/conta de outra competência ou unidade é recusada no servidor.
- Fluxo real: abrir Contas a Pagar → expandir alerta → escrever/sugerir → salvar → regenerar → conferir memória.
- QA claro/escuro, desktop/mobile e pelo menos uma tela com muitos alertas.

## Critérios de aceite

1. Cada alerta mostra a matemática determinística e oferece texto livre no próprio cartão.
2. O status é opcional, operacional e não obriga causa.
3. Uma nota salva reaparece na mesma ocorrência e é enviada como contexto à próxima análise.
4. Um rascunho de IA, quando existir, é editável, claramente identificado e nunca salvo sem confirmação.
5. Uma falha de Gemini não impede alertar, visualizar valores ou salvar texto manual.
6. A identidade não carrega justificativa para conta ambígua, item novo/removido ou outra unidade.
7. Cache é invalidado quando memória humana relevante muda.
8. RLS, validações e idempotência permanecem válidos.
9. Testes e QA comprovam que a experiência esclarece a variação sem alterar nenhum valor financeiro.

## Riscos e contrapontos registrados

- **Deriva de chave:** descrições e fornecedores podem mudar. A precedência por conta/modelo e o “não reutilizar se ambíguo” são obrigatórios.
- **Falsa sensação de aprendizado:** notas são recuperação de contexto, não treinamento. A UI e a documentação devem usar “memória/contexto”, não “a IA aprendeu a verdade”.
- **Rascunho com excesso de confiança:** saída nula quando faltar base e edição humana obrigatória reduzem esse risco.
- **Histórico limitado:** `updated_at` mostra o último estado, não todas as versões. Auditoria append-only fica registrada como evolução futura, não como promessa deste escopo.
- **Dados de produção insuficientes para E2E:** como não há notas específicas reais hoje, o teste deve usar fixture controlada e remover/reverter os dados ao final.

## Resultado esperado

Ao final, Maria ou Ana consegue abrir um alerta, entender exatamente o que mudou, registrar a explicação que conhece e continuar o fechamento do mês sem sair da tela. No mês seguinte, o sistema usa esse contexto para reduzir perguntas repetidas, mas os números continuam vindo do comparador determinístico e a decisão continua humana.
