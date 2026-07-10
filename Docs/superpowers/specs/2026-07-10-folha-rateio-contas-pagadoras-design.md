# Folha por conta pagadora e geracao de Contas a Pagar - Design Spec

**Data:** 2026-07-10
**Status:** Design aprovado no brainstorm; aguardando plano de implementacao
**Escopo:** Folha de Pagamento, rateio mensal por conta pagadora e fechamento financeiro
**Fora deste documento:** implementacao imediata, migracoes no banco vivo e alteracoes no fluxo atual de aprovacao

---

## 1. Resumo executivo

A Folha de Pagamento precisa gerar obrigacoes em Contas a Pagar separadas por quatro caixas reais:

- EMLA CG - Santander final 2359-2;
- Kids CG - Santander final 2360-2;
- Recreio - Santander final 2361-9;
- Barra - Santander final 2358-5.

O modelo atual conhece apenas tres unidades (`cg`, `rec`, `bar`). Isso e insuficiente porque Campo Grande possui duas empresas e duas contas pagadoras. A auditoria tambem mostrou que as linhas repetidas de uma pessoa em `lancamentos_folha` ja representam fatias financeiras mensais. Portanto, a conta pagadora pertence a cada fatia mensal, e nao ao cadastro fixo do colaborador.

A solucao aprovada e:

1. adicionar `conta_pagadora_id` em `lancamentos_folha`;
2. consolidar visualmente a pessoa em uma unica linha;
3. editar a divisao mensal em uma matriz por componente e conta;
4. validar e salvar o rateio por RPC atomica e auditada;
5. separar "aprovar a folha" de "fechar financeiramente";
6. no fechamento financeiro, gerar uma obrigacao em `contas_pagar` por conta pagadora com saldo;
7. manter essas obrigacoes no fluxo de caixa, mas fora do DRE para evitar dupla contagem.

Nao sera criada uma segunda estrutura paralela de rateio. O sistema vai explicitar, validar e apresentar melhor o modelo de fatias que ja existe.

---

## 2. Evidencias da auditoria

### 2.1 O que os dados de julho/2026 provaram

Na folha de julho/2026:

- `folha_id = 17`;
- status aprovado;
- total geral de R$ 170.859,46;
- 138 linhas em `lancamentos_folha`;
- 67 colaboradores distintos;
- a soma de `lancamentos_folha.total` bate exatamente com `folhas_mensais.total_geral`.

Exemplos:

| Pessoa | Fatias atuais | Total consolidado |
|---|---:|---:|
| Ana Paula | Recreio R$ 1.050,00 + CG R$ 1.499,32 + Barra R$ 950,00 | R$ 3.499,32 |
| Roseane Alves | Recreio R$ 1.420,00 + CG R$ 1.650,00 + Barra R$ 780,00 | R$ 3.850,00 |
| Marcos Quintela | Recreio R$ 1.000,00 + Barra R$ 800,00 + CG R$ 1.420,00 | R$ 3.220,00 |
| Matheus Felipe Lourenco | CG R$ 400,00 + Barra R$ 250,00 + Recreio R$ 350,00 | R$ 1.000,00 |

Essas repeticoes nao sao, por si so, duplicidades. Sao fatias legitimas do mesmo pagamento.

### 2.2 Duplicidade que hoje nao pode ser decidida pelo sistema

Foi encontrado um caso com a mesma pessoa, unidade e categoria em duas linhas: Matheus Lana em Barra/professores. Sem conta pagadora explicita, o sistema nao consegue distinguir entre:

- duas fatias legitimas;
- duplicacao operacional;
- componentes que deveriam estar consolidados.

Essa ambiguidade e eliminada quando cada fatia passa a ter conta pagadora e a gravacao canonica impede duas linhas com a mesma chave mensal.

### 2.3 Regra de negocio confirmada

- Staff e professores variam todos os meses.
- Salarios, bonus, comissoes, quantidade de alunos, passagens, reembolsos e descontos podem mudar.
- Equipe operacional de Recreio e Barra costuma ser simples, mas nao deve receber inferencia automatica silenciosa.
- Equipe operacional de Campo Grande tambem pode ser rateada entre EMLA CG e Kids CG. Jeremias e um exemplo.
- Qualquer categoria pode precisar de mais de uma conta pagadora.

Conclusao: conta pagadora e dado da competencia mensal, nunca uma configuracao fixa do colaborador.

---

## 3. Objetivos e nao objetivos

### 3.1 Objetivos

- Representar corretamente as quatro contas pagadoras.
- Permitir que Rose/Ana distribuam cada componente mensal por conta.
- Mostrar uma pessoa uma vez na listagem, sem esconder suas fatias.
- Preservar todos os totais da folha, da pessoa, da categoria e dos componentes.
- Impedir fechamento financeiro com rateio incompleto ou incoerente.
- Gerar Contas a Pagar idempotentes por conta pagadora.
- Permitir operacao futura da Maria por ferramentas estreitas e auditadas.
- Evitar dupla contagem entre Folha, Contas a Pagar e DRE.

### 3.2 Nao objetivos

- Fixar a conta pagadora no cadastro do colaborador.
- Inferir automaticamente Kids CG versus EMLA CG.
- Recalcular remuneracao, comissao ou quantidade de alunos.
- Alterar a regra atual de aprovacao da folha nesta primeira entrega.
- Reescrever todo o historico.
- Criar uma tabela paralela de rateio sem necessidade.
- Tratar as obrigacoes geradas como novas despesas no DRE.

---

## 4. Terminologia e fontes de verdade

### 4.1 Fatia mensal

Uma linha canonica de `lancamentos_folha` para a combinacao:

- folha;
- colaborador;
- categoria de folha;
- conta pagadora.

A fatia contem os componentes financeiros daquele pedaco: salario, bonus, comissao, reembolso, passagem, INSS e descontos.

### 4.2 Conta pagadora

E o caixa bancario do qual o valor sera efetivamente pago. A cadeia fiscal e:

`conta_pagadora -> empresa -> centro/unidade`

A conta e a fonte da verdade. Empresa, centro e unidade sao derivados dela.

### 4.3 Aprovacao da folha

Confirma que a composicao e os valores da folha foram revisados. Continua sendo o estado operacional ja existente em `folhas_mensais`.

### 4.4 Fechamento financeiro

Confirma que a divisao por conta pagadora esta reconciliada e gera as obrigacoes em Contas a Pagar. E um marco diferente da aprovacao.

### 4.5 Unidade e DRE

No modelo atual, a unidade das linhas participa dos totais da folha. Com a nova arquitetura, `unidade` sera derivada da conta pagadora:

- EMLA CG e Kids CG derivam `cg`;
- Recreio deriva `rec`;
- Barra deriva `bar`.

Assim, a distribuicao operacional por unidade continuara acompanhando a alocacao das fatias. Separar custo gerencial de caixa em dois rateios independentes seria uma evolucao futura e nao sera introduzida silenciosamente agora.

---

## 5. Modelo de dados

### 5.1 Correcao do desenho anterior

A migration ja aplicada no banco vivo adicionou `colaboradores.conta_pagadora_id`, mas a branch correspondente nao foi mergeada e nenhuma atribuicao foi gravada.

O historico deve ser tratado assim:

1. preservar sem edicao o arquivo da migration ja aplicada;
2. incluir esse arquivo no historico versionado para ambientes limpos;
3. criar migration corretiva posterior que remova o indice, a FK e `colaboradores.conta_pagadora_id`;
4. nao mergear o frontend antigo da PR #7;
5. nunca reescrever uma migration que ja rodou em producao.

Em ambiente limpo, as duas migrations rodam em ordem e o estado final fica correto. No banco vivo, apenas a corretiva ainda precisa rodar.

### 5.2 Coluna mensal correta

Adicionar em `lancamentos_folha`:

    conta_pagadora_id uuid null
      references public.financeiro_contas_bancarias(id)

Tambem adicionar indice para consultas por folha e conta.

A coluna nasce nullable para retrocompatibilidade e para permitir reconciliacao manual dos meses escolhidos. O preflight, e nao um `NOT NULL` global imediato, bloqueia apenas o fechamento financeiro de uma folha incompleta.

### 5.3 Chave canonica das fatias resolvidas

Depois de introduzir a coluna, criar indice unico parcial equivalente a:

    unique (folha_id, colaborador_id, categoria, conta_pagadora_id)
    where conta_pagadora_id is not null

Isso permite dados historicos ainda nao reconciliados, mas impede duas fatias resolvidas para a mesma pessoa, categoria e conta no mesmo mes.

Se duas linhas atuais forem legitimas para a mesma chave, seus componentes devem ser consolidados na linha canonica. Se forem erro, a reconciliacao explicita corrige antes de fechar.

### 5.4 Coerencia fiscal

Toda fatia resolvida deve obedecer:

- conta ativa e existente;
- empresa ativa da conta;
- centro/unidade derivado da empresa;
- `lancamentos_folha.unidade` igual ao codigo do centro derivado.

O banco deve validar essa coerencia por RPC e por defesa em profundidade. O frontend apenas antecipa a regra para boa UX.

Nao duplicar `empresa_id` ou `centro_custo_id` em `lancamentos_folha`: isso criaria tres fontes de verdade. Esses dados sao obtidos pelo relacionamento da conta.

### 5.5 Vinculo das obrigacoes geradas

Na fatia de fechamento, `contas_pagar` precisa receber um vinculo explicito com a folha, por exemplo `folha_mensal_id`, nullable para nao afetar contas existentes.

Tambem sera necessario incluir `folha_pagamento` no dominio permitido de `tipo_lancamento`, seguindo o mesmo procedimento seguro ja usado para `fatura_cartao`: recriar o `CHECK` de forma versionada e coberta por teste.

Uma restricao unica parcial deve garantir no maximo uma obrigacao ativa por:

- folha mensal;
- conta pagadora;
- tipo `folha_pagamento`.

O identificador nao pode depender de descricao textual.

### 5.6 Estado financeiro da folha

`folhas_mensais` precisa representar o fechamento financeiro sem reutilizar o status de aprovacao. O desenho conceitual inclui:

- estado financeiro `aberto` ou `fechado`;
- data/hora do fechamento;
- referencia ao evento de auditoria e ao ator resolvido.

O formato exato do ator deve reutilizar o padrao auditavel ja existente no projeto. Nao criar um segundo sistema de identidade.

---

## 6. Escrita atomica do rateio

### 6.1 Porta unica

O frontend nao deve fazer varios `INSERT`, `UPDATE` e `DELETE` independentes. A divisao sera salva por uma RPC estreita, transacional e auditada.

Contrato conceitual:

    folha_rateio_contas_salvar(
      p_folha_id,
      p_colaborador_id,
      p_fatias_json,
      p_ator default '{}'
    )

Cada fatia enviada contem:

- categoria existente daquele colaborador na folha;
- conta pagadora;
- salario;
- bonus;
- comissao;
- reembolso;
- passagem;
- INSS;
- descontos.

### 6.2 Regras da RPC

A RPC deve:

1. autenticar e resolver o ator sem aceitar spoof do frontend;
2. bloquear as linhas atuais da pessoa/folha com `FOR UPDATE`;
3. recusar alteracao se a folha ja tiver obrigacoes financeiras ativas;
4. validar todas as contas e derivar a unidade;
5. impedir contas repetidas dentro da mesma categoria;
6. preservar exatamente os totais antes/depois de cada componente e categoria;
7. preservar exatamente o total liquido da pessoa;
8. fazer upsert das fatias canonicas e remover apenas fatias obsoletas dentro da mesma transacao;
9. recalcular os totais da folha;
10. provar que o total geral antes e depois e identico;
11. gravar auditoria com antes, depois, ator, canal e competencia;
12. retornar a pessoa consolidada e o resultado do preflight.

Qualquer divergencia causa rollback total. Nao existe salvamento parcial.

Depois que a experiencia consolidada entrar, os componentes nao podem continuar sendo editados por atalhos que ignoram a reconciliacao. Edicao de remuneracao altera primeiro o total consolidado da pessoa/categoria; a matriz redistribui esse total. Nenhuma tela deve modificar silenciosamente apenas uma fatia resolvida e deixar as demais sem revalidacao.

### 6.3 Precisao monetaria

- Calculos usam `numeric` no banco e centavos inteiros na UI.
- Comparacoes sao exatas em centavos.
- O ultimo campo editado nao absorve diferenca silenciosamente.
- Se a soma nao bater, a UI mostra a diferenca e o botao permanece bloqueado.

### 6.4 Categorias multiplas na mesma pessoa

Uma pessoa pode aparecer em mais de uma categoria no mesmo mes. Anne Krissya e um caso real.

A listagem continua com uma pessoa, mas o modal mostra uma secao compacta por categoria quando necessario. Cada secao tem a mesma matriz por conta. O salvamento preserva os totais de cada categoria; nunca achata categorias diferentes em uma unica linha ambigua.

### 6.5 Metadados estruturados

`lancamentos_folha.detalhamento` pode conter dados estruturados, inclusive `__bistro`. A implementacao nao pode perder, duplicar ou converter esses dados em texto livre.

Antes da RPC ser escrita, o plano de implementacao deve inventariar todas as chaves estruturadas usadas no repositorio. Regras minimas:

- simples troca de conta preserva integralmente o detalhamento da fatia;
- consolidacao de duas linhas detecta conflitos de metadados;
- divisao de uma linha com metadado monetario exige distribuicao coerente e soma exata;
- conflito nao resolvido bloqueia o salvamento com mensagem clara;
- testes obrigatorios cobrem o metadado `__bistro`.

---

## 7. Experiencia aprovada

### 7.1 Lista consolidada

Cada colaborador aparece uma unica vez, com:

- nome e funcao;
- categoria ou categorias;
- total mensal consolidado;
- chips de conta com valor por conta;
- estado `A conciliar`, `Parcial` ou `Conciliado`;
- acao `Ajustar divisao`.

Exemplo:

    Ana Paula                         R$ 3.499,32
    EMLA CG R$ 1.499,32 | Recreio R$ 1.050,00 | Barra R$ 950,00
    [Conciliado] [Ajustar divisao]

A interface elimina a impressao visual de tres salarios, mas mantem as tres fatias financeiras por baixo.

### 7.2 Modal desktop

No desktop, usar matriz:

| Componente | EMLA CG | Kids CG | Recreio | Barra | Total |
|---|---:|---:|---:|---:|---:|
| Salario | campo | campo | campo | campo | fixo |
| Bonus | campo | campo | campo | campo | fixo |
| Comissao | campo | campo | campo | campo | fixo |
| Reembolso | campo | campo | campo | campo | fixo |
| Passagem | campo | campo | campo | campo | fixo |
| INSS (-) | campo | campo | campo | campo | fixo |
| Descontos (-) | campo | campo | campo | campo | fixo |

O total de cada linha e o total da pessoa sao referencias imutaveis durante o rateio.

### 7.3 Modal mobile

No mobile, nao comprimir a matriz. Mostrar blocos verticais por conta:

- conta e empresa;
- campos dos componentes;
- subtotal da conta;
- resumo fixo no rodape com total distribuido, diferenca e acao de salvar.

### 7.4 Sugestoes, nunca inferencias silenciosas

- Recreio pode sugerir a conta Recreio.
- Barra pode sugerir a conta Barra.
- Campo Grande sempre exige escolha entre EMLA CG e Kids CG.
- Qualquer categoria, inclusive equipe operacional, pode ser dividida.
- Sugestoes so viram dado depois de confirmacao humana.

Ao duplicar uma competencia, valores e linhas podem ser copiados como hoje, mas `conta_pagadora_id` nao e carregado como reconciliacao confirmada. A nova folha nasce a conciliar. A alocacao anterior pode aparecer como referencia visual, nunca como dado gravado sem nova confirmacao.

### 7.5 Design system e contraste

Usar exclusivamente componentes e tokens existentes:

- `bg-surface`;
- `bg-surface-2`;
- `border-line`;
- `border-line-strong`;
- `text-primary`;
- `text-secondary`;
- `text-muted`;
- `bg-accent`;
- tokens de sucesso, alerta e perigo.

Os mockups aprovados eram estruturais. A implementacao real deve ter contraste legivel nos temas claro e escuro, sem valores escuros sobre fundo escuro, sem cores hex novas e sem componentes paralelos.

---

## 8. Preflight do fechamento financeiro

O fechamento so pode prosseguir quando:

1. todo colaborador presente naquela folha tem suas fatias resolvidas;
2. nenhuma fatia tem `conta_pagadora_id` nulo;
3. toda conta esta ativa e fiscalmente coerente;
4. nao ha conflito de chave canonica;
5. por pessoa, categoria e componente, a soma das contas bate com o valor original;
6. por pessoa, o total liquido distribuido bate com o total mensal;
7. a soma das contas bate com `folhas_mensais.total_geral`;
8. nao ha metadado estruturado perdido ou conflitante;
9. nenhuma obrigacao ativa da mesma folha/conta ja existe fora do fluxo idempotente.

O preflight retorna lista estruturada de problemas, contagem de pessoas pendentes e totais por conta. A UI leva a Rose diretamente para cada pendencia.

O indicador do cadastro fixo deixa de ser "ativos sem conta pagadora". O indicador correto fica na competencia da folha: "X pessoas a conciliar nesta folha".

---

## 9. Fechamento e reabertura

### 9.1 Fechamento

Fluxo aprovado:

1. folha pode estar aprovada antes da reconciliacao financeira;
2. Rose/Ana concluem a divisao por conta;
3. sistema executa o preflight;
4. usuaria informa a data de vencimento/pagamento operacional;
5. RPC de fechamento gera uma conta a pagar por conta pagadora com saldo maior que zero;
6. cada obrigacao recebe empresa, centro, unidade e conta derivados;
7. a folha recebe um estado financeiro separado, com data e ator do fechamento.

Campos conceituais da obrigacao:

- tipo de lancamento `folha_pagamento`;
- descricao com competencia e empresa/conta;
- valor consolidado daquela conta;
- competencia da folha;
- vencimento escolhido;
- `folha_mensal_id`;
- `conta_pagadora_id`;
- `empresa_id`, `centro_custo_id` e `unidade` derivados;
- `plano_conta_id = null`.

### 9.2 Idempotencia

Repetir o fechamento:

- nao cria uma segunda obrigacao;
- retorna as obrigacoes existentes se o conteudo for identico;
- recusa se houver divergencia inesperada;
- registra tentativa e resultado em auditoria.

### 9.3 Reabertura

- Se nenhuma obrigacao gerada estiver paga, a reabertura cancela essas obrigacoes e libera a reconciliacao.
- Se alguma estiver paga, a reabertura comum e bloqueada.
- Correcao depois de pagamento exige fluxo administrativo explicito, motivo obrigatorio e auditoria; nao e uma acao comum da Rose/Ana.

Reabrir financeiramente nao deve desaprovar silenciosamente a folha. Os dois estados sao independentes.

---

## 10. Fluxo de caixa e anti-dupla-contagem

Os lancamentos da folha sao a despesa economica detalhada. As contas geradas no fechamento sao instrumentos de liquidacao por caixa.

Consequencias:

- as quatro obrigacoes entram em Contas a Pagar e no relatorio diario;
- o pagamento/baixa ocorre por conta pagadora;
- elas nao pedem plano de contas;
- elas ficam fora da soma por plano, DRE, auditoria de despesa e comparativos de custo;
- Edge Functions e seletores financeiros devem excluir `tipo_lancamento = 'folha_pagamento'` das somas economicas, assim como ja ocorre com `fatura_cartao`;
- o total de caixa pago continua rastreavel contra o total da folha.

Regra dura:

    soma das obrigacoes de folha = total geral da folha

e nunca:

    despesa da folha + obrigacoes de folha

---

## 11. Historico e estrategia de migracao

- Nenhum mes historico sera preenchido automaticamente.
- Nao atribuir contas por unidade sem confirmacao.
- Somente competencias que precisem de fechamento financeiro devem ser reconciliadas.
- Julho/2026 pode ser a primeira competencia piloto.
- Linhas nulas continuam legiveis nos dashboards atuais.
- A migration e aditiva e o fechamento e que exige completude.
- Casos suspeitos, como duas linhas da mesma pessoa/categoria/unidade, aparecem numa fila de revisao; o sistema nao decide sozinho.
- Duplicar o mes preserva os valores, mas remove a confirmacao de conta pagadora da nova competencia.

Antes de criar o indice unico parcial, nao e necessario alterar historico porque as linhas antigas permanecem com conta nula. A restricao passa a valer quando uma fatia e resolvida.

---

## 12. Maria e canais de operacao

Na etapa futura, Maria podera:

- consultar preflight e totais por conta;
- listar pessoas pendentes;
- sugerir uma divisao;
- aplicar uma divisao somente mediante confirmacao autorizada;
- consultar obrigacoes geradas e seus estados.

Escrita da Maria deve usar a mesma RPC estreita, com papel operacional, identidade real do remetente, canal WhatsApp/grupo e texto original no audit log.

Maria nao recebe DML direto, SQL livre nem ferramenta generica. Se a acao nao estiver coberta pela RPC segura, ela apenas prepara e solicita liberacao.

---

## 13. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Confundir unidade com conta em CG | Conta pagadora explicita; unidade derivada; EMLA e Kids continuam distintas |
| Criar duas despesas no DRE | `folha_pagamento` fora das somas economicas |
| Salvar metade do rateio | Uma RPC e uma transacao |
| Perder categoria de uma pessoa | Secoes por categoria e validacao por categoria/componente |
| Perder metadado do Bistro | Inventario, regra de merge e testes de `__bistro` |
| Erro de centavos | Centavos inteiros na UI, `numeric` no banco e igualdade exata |
| Duplicar obrigacao ao clicar duas vezes | Chave folha+conta, RPC idempotente |
| Reabrir depois de pagamento | Bloqueio e correcao administrativa auditada |
| Inferir conta errada em REC/BAR | Sugestao visivel, nunca gravacao automatica |
| Merge indevido da PR #7 | Preservar apenas o historico da migration e substituir o desenho funcional |
| Regredir folha atual | Coluna nullable, leitura compativel e entregas fatiadas |

---

## 14. Plano de entrega em fatias

### Fatia A - Fundacao e integridade

- preservar migration ja aplicada do campo incorreto;
- migration corretiva removendo conta do colaborador;
- adicionar conta em `lancamentos_folha`;
- FK, indice e unicidade parcial;
- RPC atomica de rateio;
- preflight read-only;
- auditoria e testes de metadados;
- sem gerar Contas a Pagar.

### Fatia B - Experiencia de reconciliacao

- lista consolidada por pessoa;
- chips e estados de conciliacao;
- matriz desktop;
- blocos mobile;
- secoes por categoria quando necessario;
- sugestoes REC/BAR com confirmacao;
- temas claro/escuro e QA com Rose/Ana.

### Fatia C - Fechamento financeiro

- estado financeiro separado;
- fechamento/reabertura;
- geracao idempotente das obrigacoes;
- data de vencimento escolhida;
- relatorio diario e baixa normal;
- exclusao do DRE/IA/comparativos;
- bloqueios de reabertura depois de pagamento.

### Fatia D - Maria

- leitura do preflight;
- sugestoes;
- aplicacao confirmada via RPC operacional;
- carimbo visual e auditoria completa;
- respostas sanitizadas no WhatsApp.

Cada fatia tem branch, migration testada, gates completos, auditoria de banco e QA visual antes de merge.

---

## 15. Estrategia de testes

### 15.1 Banco e RPC

- Ana Paula dividida entre tres contas, preservando R$ 3.499,32.
- Jeremias dividido entre EMLA CG e Kids CG, ambos derivados para `cg`.
- Professor com salario variavel entre competencias.
- Staff com bonus/comissao variaveis.
- Pessoa com duas categorias no mesmo mes.
- Soma errada por R$ 0,01 deve bloquear.
- Conta inativa deve bloquear.
- Conta Recreio com unidade `bar` deve bloquear.
- Duas fatias da mesma categoria/conta devem bloquear ou consolidar explicitamente.
- Concorrencia entre duas edicoes deve serializar e impedir perda de atualizacao.
- `__bistro` deve sobreviver a troca de conta e bloquear merge ambiguo.
- Retry da mesma operacao deve ser idempotente.

### 15.2 Fechamento

- quatro contas com saldo geram quatro obrigacoes.
- conta com saldo zero nao gera obrigacao.
- soma das obrigacoes bate com total geral.
- segundo fechamento nao duplica.
- obrigacao sem plano aparece em Contas a Pagar e nao no DRE.
- reabertura sem baixa cancela e libera.
- reabertura com uma obrigacao paga bloqueia.

### 15.3 Frontend

- uma linha visivel por pessoa.
- chips exibem contas e subtotais corretos.
- matriz inicia com os dados atuais.
- estado parcial mostra diferenca.
- foco, teclado, rolagem e campos monetarios funcionam.
- mobile usa blocos verticais sem overflow.
- textos e valores tem contraste nos temas claro e escuro.
- lista atual e dashboards permanecem corretos antes da reconciliacao.

### 15.4 Regressao

- suite atual do repositorio permanece verde.
- aprovacao da folha continua funcionando sem depender do fechamento.
- Bistrô, comparativo, dashboard e mobile continuam lendo totais corretos.
- duplicacao de competencia copia os valores, nasce a conciliar e nao cria fatia repetida.

---

## 16. Criterios de aceite

O desenho estara implementado quando:

1. conta pagadora nao existir mais no cadastro fixo do colaborador;
2. cada fatia mensal reconciliada tiver uma conta valida;
3. uma pessoa aparecer uma vez na lista, com suas contas visiveis;
4. Rose/Ana conseguirem dividir os componentes por conta em desktop e mobile;
5. nenhuma alteracao mudar os totais originais;
6. preflight explicar exatamente o que falta;
7. fechamento gerar obrigacoes por conta sem duplicidade;
8. obrigacoes entrarem no caixa e ficarem fora do DRE;
9. reabertura respeitar pagamentos ja efetuados;
10. Maria usar somente portas seguras e deixar autoria visivel;
11. temas claro e escuro passarem no QA visual;
12. todos os testes, typecheck, build e diff check ficarem verdes.

---

## 17. Decisoes aprovadas

- A conta pagadora pertence a `lancamentos_folha`, nao a `colaboradores`.
- O modelo existente de fatias sera reutilizado e tornado explicito.
- A listagem sera consolidada por pessoa.
- A edicao sera feita pela opcao B: matriz mensal por componente e conta.
- Qualquer categoria pode ser dividida, inclusive operacional de Campo Grande.
- EMLA CG e Kids CG permanecem duas contas distintas da mesma unidade.
- Valores variam por competencia; nao existe rateio fixo no cadastro.
- Aprovacao e fechamento financeiro sao estados separados.
- Contas a Pagar de folha sao instrumentos de caixa fora do DRE.
- O historico nao sera preenchido automaticamente.
- Nenhuma inferencia silenciosa gravara conta pagadora.

Nao restam decisoes de negocio bloqueadoras para a elaboracao do plano de implementacao.
