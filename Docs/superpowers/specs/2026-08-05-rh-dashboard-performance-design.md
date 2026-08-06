# Dashboard RH: desempenho de abertura

## Objetivo

Fazer o primeiro carregamento do Dashboard RH deixar de depender de uma cascata de chamadas cliente-servidor, sem ampliar a visibilidade de dados definida por RLS.

## Diagnóstico que orienta o desenho

- A reprodução autenticada levou cerca de 3,3 segundos, embora as consultas no banco levassem de 5 a 14 ms.
- O Dashboard espera seis operações no cliente antes de renderizar. A operação de fila cria cinco ondas de rede, incluindo uma leitura de perfil cujo `role` não é usado naquele fluxo.
- Hoje não há prazo de cancelamento no carregamento do Dashboard; uma chamada pendurada mantém o spinner global.

## Desenho aprovado

1. Criar a RPC `rh_dashboard_bootstrap()` como `SECURITY INVOKER`, sem argumentos e baseada em `auth.uid()`. Ela devolve um JSON com os dados do primeiro quadro: KPIs, KPIs de PDI, até oito alertas, até oito documentos pendentes, até seis itens da fila do usuário e até oito eventos recentes. Por ser invocadora, cada leitura continua submetida ao RLS existente.
2. Criar índices de leitura por usuário para participantes e responsáveis de etapa, e de ordenação para o histórico global.
3. Substituir as seis leituras iniciais da tela por uma única chamada RPC. As leituras de IA e saúde de desenvolvimento permanecem não bloqueantes.
4. Renderizar o esqueleto do Dashboard imediatamente durante a primeira leitura. Falha da RPC passa a exibir estado recuperável, sem spinner indefinido.
5. Preservar os contratos atuais de dados e as regras de acesso. A migration não altera políticas RLS nem usa `SECURITY DEFINER`.

## Critérios de aceite

- A rota de primeiro carregamento da tela RH faz exatamente uma RPC para os dados principais e não chama `auth.getUser()` nesse caminho.
- A RPC retorna somente registros permitidos por RLS para o usuário autenticado.
- Alertas, documentos, fila e histórico têm os mesmos limites visuais atuais.
- O Dashboard mostra estrutura de carregamento imediatamente e permite tentar novamente após falha.
- Build, typecheck, contratos automatizados, verificação de RLS simulada e fluxo autenticado no navegador passam antes da publicação.
