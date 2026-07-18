# Contas a Receber via LA Report - Plano de Implementacao

## Objetivo

Integrar o Super Folha ao cache financeiro do LA Report sem expor credenciais entre projetos. A sincronizacao desta fatia e manual, sempre limitada a uma competencia, com preflight imutavel por `manifest_hash` e aplicacao idempotente.

## Contrato entre projetos

1. O LA Report expoe `export-contas-receber`, protegido por segredo interno dedicado e sem acesso pelo navegador.
2. O exportador exige uma competencia `YYYY-MM-01`, le `emusys_faturas` em paginas deterministicas e cruza alunos por `unidade_id + emusys_matricula_id`.
3. Duplicidades de cadastro sao agregadas como candidatos; nenhuma fatura pode ser multiplicada pelo join.
4. Cada linha recebe `row_source_hash`; o conjunto ordenado recebe um `manifest_hash` deterministico. Timestamps volateis nao participam dos hashes.
5. O Super Folha expoe `contas-receber-sync`, autentica o JWT web e chama o exportador com segredo armazenado apenas nas Edge Functions.
6. `preflight` nao escreve. `apply` refaz a leitura, exige o mesmo `manifest_hash` e chama a RPC de upsert com service role.

## Persistencia no Super Folha

- `contas_receber`: fatos financeiros espelhados, classificacao fiscal manual e rastreabilidade da origem.
- Chave natural: `(la_report_unidade_id, emusys_fatura_id)`.
- Fatos da origem sempre atualizam; classificacao manual e autoria sao preservadas.
- `contas_receber_sync_execucoes`: registra apenas aplicacoes, nunca preflights.
- `authenticated` pode ler; escrita de sincronizacao fica restrita a RPC/service role.
- `contas_receber_classificar` aceita somente usuario web autenticado ou service role, exige plano folha nivel 3/natureza entrada/ativo e deriva centro pela unidade.

## Classificacao inicial

- Parcela: `3.1.1`.
- Passaporte ou matricula: `3.1.2`.
- Locacao: `3.4.1`.
- Rateio interno: excluido da receita com motivo explicito.
- Loja/estoque e demais casos: pendentes para decisao humana.

## Interface

- Ativar `Contas a Receber` na navegacao.
- Competencia obrigatoria, filtros de unidade/status/classificacao e busca.
- KPIs usam `valor_pago` para recebido e `valor_liquido` para aberto.
- Filas separadas para pendencias manuais e rateios excluidos.
- Acao manual de classificar via RPC, sem DML direto.
- Exibir origem desatualizada e o ultimo manifest aplicado.
- Mesma capacidade operacional em desktop e mobile.

## Ordem de implementacao

1. Testes do contrato canonico/hash e agregacao de candidatos no LA Report.
2. Exportador read-only e documentacao do contrato no LA Report.
3. Testes estaticos da migration/RPC e do orquestrador no Super Folha.
4. Migration com tabelas, RLS, grants, sync RPC e classificacao RPC.
5. Edge Function de preflight/apply com trava de manifest.
6. Service, tipos, selectors e pagina do frontend.
7. Gates de ambos os repos e validacao visual desktop/mobile, claro/escuro.

## Regra de parada

Nao fazer commit, push, merge, migration remota ou deploy antes da auditoria solicitada. O relatorio final deve distinguir verificacao local de qualquer preflight remoto que dependa de funcoes ainda nao publicadas.
