# Fatia 1: Sidebar reorganizada

## Estado verificavel

- Base aprovada: `main` em `59a2caf`.
- Branch de trabalho: `codex/fatia1-sidebar-reorganizada`.
- Esta fatia altera somente navegacao e apresentacao. Nao cria pagina, rota, tabela, RPC, migration ou Edge Function.
- O Bistrô continua sendo uma aba interna da Folha de Pagamento.

## Objetivo

Preparar a navegacao do Super Folha para a expansao financeira sem expor destinos inexistentes como se estivessem prontos. Desktop, drawer mobile e barra inferior devem consumir a mesma fonte de dados, preservar todos os destinos atuais e comunicar claramente os modulos futuros.

## Inventario final

### Financeiro

| Item | Estado | Destino |
| --- | --- | --- |
| Dashboard financeiro | Em breve | Nenhum |
| Contas a Pagar | Ativo | `contas` |
| Contas a Receber | Em breve | Nenhum |
| Fluxo de Caixa | Em breve | Nenhum |
| DRE | Em breve | Nenhum |
| Conciliacao | Em breve | Nenhum |
| Cartoes | Ativo | `cartoes` |
| Bistrô | Ativo | Folha de Pagamento com a aba Bistrô ativa |

### RH / DP

| Item | Estado | Destino |
| --- | --- | --- |
| Folha de Pagamento | Ativo | `folha` |
| Jornada RH | Ativo | `rh` |
| Ferias CLT | Ativo | `ferias` |
| Agenda | Ativo | `agenda` |

O badge numerico de Ferias CLT deve permanecer visivel quando houver pendencias.

### Configuracoes

| Item | Estado | Destino |
| --- | --- | --- |
| Notificacoes | Ativo | `notificacoes` |
| Gerenciar plano de contas | Em breve | Nenhum |
| Gerenciar centros de custo | Em breve | Nenhum |
| Gerenciar empresas e contas bancarias | Em breve | Nenhum |

`Contas a Pagar` existe uma unica vez, em Financeiro. Nao existe item `Contas a Pagar` em Configuracoes.

## Modelo compartilhado

Um modulo `navigation.ts` sera a fonte unica para:

- grupos, itens, ordem, rotulos e icones;
- estado ativo ou futuro;
- destino padronizado de cada item ativo;
- inclusao na barra inferior mobile;
- badge dinamico, quando aplicavel.

O destino de navegacao deve substituir os unions e regras repetidos atualmente no `App.tsx`. A implementacao nao deve manter em paralelo as listas antigas depois que todos os consumidores migrarem para o novo contrato.

O destino do Bistrô precisa representar modulo e aba. Ao seleciona-lo, a aplicacao abre Folha de Pagamento diretamente na aba Bistrô. Nesse estado, somente Bistrô aparece ativo no menu agrupado; Folha de Pagamento nao pode aparecer simultaneamente ativa.

## Componentes

### `NavigationGroups`

Renderer compartilhado dos grupos e itens. Recebe o modelo de navegacao, o destino atual e o callback padronizado de selecao. Sidebar e drawer usam este mesmo renderer para impedir divergencia de ordem, rotulo, badge ou disponibilidade.

### `Sidebar`

Continua sendo a navegacao persistente de desktop e mantem seu estado recolhido em `localStorage`. Ela deixa de conhecer o modo drawer. As props legadas `isMobileDrawer` e `onCloseMobileDrawer` devem ser removidas se, apos a extracao, nao tiverem mais consumidores.

### `MobileNavigationDrawer`

Componente separado por decisao deliberada, pois tem semantica de modal e nao de sidebar persistente. Ele reutiliza `NavigationGroups`, mas possui seu proprio invólucro responsivo.

Comportamentos obrigatorios:

- sempre abre expandido, independente do estado salvo da sidebar desktop;
- fecha ao escolher um item ativo;
- fecha ao tocar no backdrop;
- fecha no botao de fechar;
- fecha com `Escape`;
- bloqueia a rolagem da pagina enquanto aberto e limpa esse bloqueio ao desmontar;
- respeita a area segura mobile;
- devolve o foco ao acionador `Mais` ao fechar.

### `BottomNavigation`

A barra inferior mobile tem exatamente cinco destinos:

1. Folha;
2. Contas;
3. Cartoes;
4. Agenda;
5. Mais.

`Mais` abre o drawer. Ele aparece ativo quando o destino atual nao e um dos quatro destinos fixos, incluindo Bistrô, Jornada RH, Ferias CLT e Notificacoes.

## Itens futuros e acessibilidade

Itens `Em breve` aparecem somente na navegacao completa, nunca na barra inferior. Devem usar `button disabled` nativo, sem callback e sem URL. O status `Em breve` permanece visivel e tambem integra o nome acessivel, para que o estado seja anunciado por tecnologias assistivas sem criar uma falsa acao de teclado.

Os controles do drawer precisam ter rotulos acessiveis. O container usa semantica de dialogo modal, possui nome acessivel e mantem o foco em uma interacao previsivel. Os icones continuam vindo da biblioteca ja utilizada pelo projeto.

## Aparencia e responsividade

- Reutilizar somente tokens semanticos e componentes existentes.
- Preservar temas claro e escuro.
- Nao criar cards decorativos dentro do menu.
- Manter densidade e hierarquia do design system atual.
- O drawer nao pode ultrapassar a largura da viewport nem causar rolagem horizontal.
- Rotulos longos devem quebrar de forma controlada, sem encobrir badges ou icones.

## Fora de escopo

- Criacao das paginas financeiras futuras.
- Reorganizacao interna da Folha de Pagamento.
- Alteracoes em Colaboradores, rateio, Bistrô, Contas a Pagar ou Cartoes.
- Backend, Supabase, seeds, migrations e Edge Functions.
- Mudanca no significado dos dashboards existentes.

## Arquivos previstos

- `components/navigation.ts` (novo): modelo, grupos e helpers de destino/estado ativo.
- `components/NavigationGroups.tsx` (novo): renderer compartilhado.
- `components/MobileNavigationDrawer.tsx` (novo): drawer modal mobile.
- `components/BottomNavigation.tsx` (novo): barra inferior extraida do `App.tsx`.
- `components/Sidebar.tsx`: consumir o renderer e remover o modo drawer legado.
- `App.tsx`: consumir destino padronizado, montar drawer/barra e remover unions/regras duplicadas.
- Testes focados no modelo, estado ativo e contratos de navegacao.

A lista e uma previsao de implementacao, nao permissao para ampliar o escopo. Qualquer arquivo adicional deve ser justificado no relatorio final.

## Riscos e mitigacoes

### Destinos divergirem entre superficies

Mitigacao: uma fonte de dados e um renderer compartilhado para sidebar e drawer; a barra inferior referencia os mesmos ids e destinos.

### Bistrô destacar dois itens

Mitigacao: helper unico de estado ativo considera modulo e aba, com teste especifico para Bistrô.

### Drawer herdar o estado recolhido do desktop

Mitigacao: componentes e estados separados; nenhum acesso do drawer ao `localStorage` da sidebar.

### Item futuro parecer clicavel

Mitigacao: `disabled` nativo, sem destino e sem handler, com status visivel e acessivel.

### Regressao de navegacao existente

Mitigacao: testar todos os destinos atuais e remover somente depois as regras antigas, sem introduzir novas rotas.

### Cabecalho parecer pertencer ao grupo errado ao abrir Bistrô

O Bistrô permanece uma aba da Folha nesta fatia. A auditoria visual deve confirmar que o cabecalho existente continua compreensivel. Se houver ruído, o ajuste sera apenas de rotulo em uma fatia posterior, sem mudar a arquitetura aprovada.

## Estrategia de testes

### Testes automatizados

- grupos na ordem Financeiro, RH / DP e Configuracoes;
- inventario e estados dos itens exatamente como nesta especificacao;
- itens futuros sem destino e nativamente desabilitados;
- barra mobile com quatro destinos fixos e `Mais`;
- Bistrô resolve para Folha + aba Bistrô;
- Bistrô ativo nao ativa Folha simultaneamente;
- `Mais` ativo em Bistrô, Jornada RH, Ferias CLT e Notificacoes;
- badge de Ferias CLT preservado;
- drawer sempre expandido e independente do estado desktop;
- fechamento por selecao, backdrop, botao e `Escape`;
- bloqueio de rolagem com limpeza ao fechar/desmontar;
- inexistencia dos unions/listas legados duplicados no `App.tsx`.

### Gates

- `node --test` para os testes aplicaveis do repositorio;
- `npm run typecheck`;
- `npm run build`;
- `git diff --check origin/main...HEAD`.

### Agent Browser

Validar em viewport desktop e mobile, nos temas claro e escuro:

- todos os destinos ativos navegam corretamente;
- itens futuros nao respondem a clique nem teclado;
- drawer abre e fecha pelos quatro caminhos;
- foco, scroll lock e area segura funcionam;
- barra inferior nao ultrapassa cinco itens;
- Bistrô abre a aba correta e `Mais` fica ativo;
- nenhum texto, badge ou controle se sobrepoe.

## Criterio de conclusao

A fatia esta concluida quando as tres superficies usam o mesmo modelo, os destinos existentes permanecem funcionais, os modulos futuros sao inequivocamente inativos, os comportamentos mobile passam no Agent Browser e nenhum arquivo de backend aparece no diff.
