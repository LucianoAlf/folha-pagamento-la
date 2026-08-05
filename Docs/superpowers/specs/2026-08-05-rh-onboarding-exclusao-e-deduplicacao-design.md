# Jornada RH — exclusão definitiva e prevenção de duplicidades

## Objetivo

Permitir que Ana remova definitivamente onboardings criados por engano, sem deixar processos, etapas ou tarefas órfãs; impedir que a aprovação de candidatos volte a criar colaboradores duplicados ou onboardings vazios; e reconciliar os dois pares duplicados já confirmados em produção.

## Diagnóstico confirmado

- A interface de Onboarding não oferece exclusão.
- A aprovação de candidato cria um colaborador novo sem procurar CPF já existente.
- Depois, o frontend cria o onboarding em outra sequência de escritas, sem transação única.
- `createProcessFromTemplate` cria o processo antes de provar que o template contém etapas.
- O template ativo `Novo template RH` não possui etapas nem documentos. Ele originou o onboarding vazio da Adriana.
- As tarefas da Agenda ligadas a processos e etapas usam `vinculo_tipo`/`vinculo_id`, sem chave estrangeira. Excluir só `rh_processos` deixaria tarefas órfãs.
- Existem dois pares de colaboradores com o mesmo CPF normalizado:
  - Adriana: cadastro 107 é o cadastro produtivo; 109 foi criado pela aprovação do candidato e só está ligado ao candidato e ao onboarding vazio.
  - Vitória: cadastro 106 é o cadastro original; 108 foi criado pela aprovação do candidato e concentra o onboarding válido e seus documentos.

## Abordagens consideradas

### 1. Exclusão definitiva transacional e aprovação atômica — escolhida

Operações críticas ficam em RPCs com autorização, validação e transação no banco. A exclusão também remove espelhos da Agenda; a aprovação resolve a identidade antes de criar qualquer linha. É a opção que evita estados parciais e duas fontes de verdade.

### 2. Exclusão direta pelo navegador

O frontend apagaria tarefas e processo em chamadas separadas. Foi rejeitada porque uma falha entre as chamadas deixa lixo órfão e porque a autorização e os guardrails ficariam dispersos.

### 3. Arquivamento

Foi rejeitado como comportamento principal. O processo inválido continuaria existindo e poderia contaminar pesquisas, agentes e históricos futuros.

## Desenho aprovado

### 1. Exclusão definitiva de onboarding

Criar uma RPC dedicada, restrita a `admin` e `rh`, com `SECURITY DEFINER` e `search_path` fixo.

A operação:

1. valida o usuário e o papel atual;
2. trava e relê o processo;
3. aceita somente processo do tipo `onboarding` e não concluído;
4. exige confirmação textual compatível com o título atual;
5. reúne os IDs das etapas;
6. remove de `tarefas` o espelho do processo e os espelhos dessas etapas;
7. remove `rh_processos`; as relações com FK `ON DELETE CASCADE` removem participantes, etapas, checklists, responsáveis, comentários e histórico subordinado;
8. devolve um resumo das quantidades removidas para confirmação da UI.

Nenhuma exclusão de onboarding apaga automaticamente o colaborador. Processo e pessoa têm ciclos de vida diferentes.

Na UI, o detalhe do onboarding terá ação destrutiva `Excluir onboarding`. O modal mostrará título, colaborador, quantidade de etapas e aviso de irreversibilidade. A confirmação exigirá digitar o título. Após sucesso, a lista será recarregada e selecionará o próximo processo disponível.

Processos concluídos não poderão ser excluídos por essa ação operacional. Uma eventual correção de histórico concluído exigirá manutenção administrativa separada e auditada.

### 2. Template de onboarding válido

Um template só poderá criar onboarding quando estiver ativo e tiver pelo menos uma etapa.

- O modal de novo onboarding mostrará apenas templates elegíveis.
- A aprovação de candidato fará a mesma validação no servidor antes de criar ou alterar qualquer dado.
- A RPC recusará template ausente, inativo, de outro tipo ou sem etapas.
- Documentos continuam opcionais; etapas não.
- `Novo template RH` poderá continuar como rascunho de configuração, mas não será elegível para execução enquanto estiver vazio.

### 3. Aprovação atômica e deduplicação por CPF

A conversão de candidato em colaborador e a criação opcional do onboarding devem ocorrer em uma única RPC transacional.

Fluxo:

1. valida papel `admin`/`rh` e trava o candidato;
2. valida previamente o template, quando solicitado;
3. normaliza o CPF para apenas dígitos;
4. procura colaborador existente pelo CPF normalizado;
5. se encontrar, devolve conflito explícito e exige que a UI confirme `Usar cadastro existente`; não cria outro colaborador silenciosamente;
6. sem conflito, cria o colaborador;
7. atualiza o candidato para `aprovado` e grava `colaborador_convertido_id`;
8. materializa processo, participante, etapas, checklists e documentos na mesma transação;
9. qualquer falha reverte tudo.

Adicionar índice único parcial sobre o CPF normalizado e não vazio em `colaboradores`. O índice é a proteção final contra concorrência; a confirmação na UI é a proteção de produto contra associação inesperada.

### 4. Reconciliação produtiva única

A migration não terá IDs produtivos hardcoded. A reconciliação será um script operacional separado, executado somente após preflight e confirmação dos vínculos no momento da execução.

Plano atual, sujeito ao mesmo preflight imediatamente antes da escrita:

- Adriana: apontar o candidato para 107; excluir definitivamente o onboarding vazio ligado a 109, incluindo sua tarefa de Agenda; excluir o colaborador 109.
- Vitória: mover candidato, onboarding válido e documentos de 108 para 106; preservar etapas, progresso e tarefas; excluir o colaborador 108.
- Criar o índice único somente depois de confirmar que não restou CPF normalizado duplicado.

O script deve abortar se aparecer qualquer vínculo novo não previsto, se os CPFs deixarem de coincidir ou se o onboarding esperado mudar de estado. Nenhuma referência de folha, férias, financeiro ou DRE será alterada por inferência.

## Tratamento de erros

- Erros do banco serão traduzidos para mensagens específicas: sem permissão, processo concluído, confirmação divergente, template incompleto e CPF já existente.
- A UI manterá o modal aberto quando houver erro e não atualizará otimisticamente a lista.
- Repetir clique ou chamada não poderá apagar outro processo nem duplicar aprovação.
- A RPC de exclusão falhará integralmente; não haverá processo apagado com tarefa órfã ou tarefa apagada com processo preservado.

## Testes

### Automatizados

- contrato SQL da RPC de exclusão: papel, `SECURITY DEFINER`, `search_path`, tipo permitido, bloqueio de concluído e revogação para `public`/`anon`;
- fixture transacional provando remoção de processo, filhos e espelhos de Agenda;
- rollback integral ao simular falha;
- template sem etapas rejeitado antes de qualquer criação;
- aprovação com CPF novo cria uma pessoa e um onboarding completo;
- aprovação com CPF existente não duplica e só reutiliza após confirmação explícita;
- corrida de duas aprovações do mesmo CPF termina com um único colaborador;
- reconciliação de candidato/processo/documentos preserva referências válidas.

### Browser

- abrir onboarding válido e vazio;
- abrir e cancelar o modal destrutivo;
- confirmar texto incorreto e verificar bloqueio;
- excluir uma fixture descartável e confirmar desaparecimento da lista e da Agenda;
- tentar aprovar candidato com CPF existente e validar a escolha explícita;
- tentar template vazio e validar mensagem acionável;
- criar onboarding com template completo e conferir todas as etapas.

### Produção

- preflight read-only dos dois pares duplicados imediatamente antes da reconciliação;
- executar a reconciliação uma única vez;
- confirmar zero CPFs normalizados duplicados;
- confirmar que Adriana mantém somente o onboarding correto e Vitória mantém o onboarding válido com etapas e documentos;
- confirmar zero tarefas `rh_processo`/`rh_etapa` órfãs;
- confirmar que folha, férias, financeiro e DRE não sofreram alteração.

## Limites e rito

- O design autoriza exclusão definitiva, mas não uma exclusão genérica de colaboradores pela tela de onboarding.
- A reconciliação produtiva é destrutiva e terá preflight/readback próprio antes da execução.
- Implementar com testes primeiro, validar build e Simple Browser, revisar o diff, aplicar a migration e a reconciliação somente nos checkpoints autorizados.
- Trabalho direto na `main`, conforme orientação do projeto; publicar apenas depois das validações completas.
