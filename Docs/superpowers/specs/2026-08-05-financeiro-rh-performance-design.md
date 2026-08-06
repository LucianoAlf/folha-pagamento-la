# Performance: telas Financeiro e RH

## Objetivo

Fazer as telas operacionais renderizarem uma estrutura útil imediatamente, evitarem espera indefinida e carregarem dados de referência em segundo plano, sem mudar regras financeiras, RLS, valores ou sincronizações.

## Evidência que orienta o desenho

- Contas a Pagar bloqueia a tela aguardando sete leituras principais, além de credenciais e códigos do mês.
- Cartões bloqueia a tela em cinco leituras paralelas. Os registros de produção mostram essas cinco respostas `200` concentradas em cerca de 63 ms, portanto uma nova RPC não é justificada: o ganho é liberar a tela antes dos dados exclusivos de modal.
- A Folha registrou um `500` com `statement timeout` ao buscar colaboradores. A consulta base atual retorna 90 colaboradores em aproximadamente 3 ms, e a política de leitura é `true`; a falha é transitória ou de infraestrutura, não uma regra de negócio a ser reescrita no frontend.
- Férias faz duas leituras no primeiro quadro. O resultado atual é pequeno, mas cada alteração de filtro relê também as programações, que não dependem dos filtros da lista.
- DRE já consulta uma única RPC. Contas a Receber faz duas leituras. Não serão alteradas nesta fatia.
- Agenda força sincronização potencialmente mutável ao abrir; fica fora da implementação até uma decisão de produto.

## Desenho aprovado

1. Reaproveitar o utilitário de leitura cancelável já existente para requisições REST ao Supabase. Ele aborta em 10 segundos, preserva o erro original quando não é prazo e apresenta erro recuperável quando o prazo expira.
2. Na Folha, aplicar a leitura resiliente às chamadas brutas de metadados e colaboradores. A lista de colaboradores continua secundária ao primeiro quadro e uma falha transitória não pode manter a tela bloqueada.
3. Em Contas a Pagar, carregar as contas do período como dado crítico e liberar a página assim que elas chegarem. Plano, grupos, centros, empresas, contas bancárias e estatísticas de uso passam a preencher em segundo plano; controles dependentes permanecem desabilitados até seu conjunto estar pronto.
4. Em Cartões, tratar cartões e faturas como dados críticos; empresas, contas bancárias e centros de custo são referências de modal e carregam em segundo plano. Trocar o spinner global por skeleton da tela e usar o mesmo prazo cancelável.
5. Em Férias, manter a consulta de status como o dado crítico e separar programações da recarga causada por busca/ordenação. Programações serão carregadas uma vez e atualizadas somente após uma ação que as altere; a lista recebe debounce para não consultar a cada tecla.

## Limites e aceites

- Não criar RPCs, não alterar RLS, não alterar dados financeiros/RH e não mudar DRE ou Contas a Receber.
- Nenhuma interação em Agenda será acionada nesta fatia.
- Cada tela deve ter skeleton local, timeout real de 10 s, estado de erro com nova tentativa e dados críticos visíveis antes das referências de modal.
- Testes devem provar o contrato de carregamento progressivo e cancelamento; typecheck, build e navegação autenticada em produção devem passar.
