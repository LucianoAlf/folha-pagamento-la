# Handoff — Débito automático em contas a pagar (fase 2, lado da Maria)

> **STATUS: fase 1 em produção (02/09/2026, Super Folha).** Este arquivo é o contrato para a fase 2, do lado da Maria.
> Escrito no repo do Super Folha (`Docs/handoffs/`); o lado da Maria copia.

## 0. O que já existe (fase 1, entregue)

- **Coluna** `public.contas_pagar.debito_automatico boolean not null default false` (migration servidor `20260902115559 contas_pagar_debito_automatico`). Índice parcial `contas_pagar_debito_automatico_idx` onde `true`.
- **Semântica:** a conta se paga sozinha na conta pagadora (`conta_pagadora_id`). É **ortogonal** a `fonte_tipo` (de onde vem a fatura — uma Light pode ter fonte `site` e ser débito automático) e a `metodo_pagamento` (como **foi** paga, gravado na baixa).
- **Herança:** instâncias recorrentes copiam o modelo por spread nos dois materializadores (edge e cliente) — a flag do modelo vale para os próximos meses automaticamente. Editar uma instância no app com "aplicar aos futuros" propaga a flag ao modelo e às instâncias pendentes futuras.
- **Backfill feito:** 24 linhas flagadas (7 pendentes, 15 pagas, 2 canceladas) e 9 modelos (Light 164 ×3 CG, Light Loja 168 e 172 Recreio, Verisure, Porto Seguro, Parcelamento Previdência, Internet Claro Kids). O contorno da Rose (texto "PG em Débito Automático" na chave PIX fixa, fonte `pix_fixo`) foi limpo: `pix_chave_fixa = null`, `fonte_tipo = null` nessas linhas. Casing dos métodos normalizado (`Pix`→`PIX`, `boleto`→`Boleto`, `débito automático`→`Débito Automático`). **Valor canônico gravado em `metodo_pagamento`: `Débito Automático`** (D, é com acento agudo, espaço, A, á com acento agudo — UTF-8 `44 c3a9 62 69 74 6f 20 41 75 74 6f 6d c3a1 74 69 63 6f`; é o mesmo rótulo de `METODOS_PAGAMENTO` no front e da allowlist de `maria_contas_dar_baixa`). **Lista final dos valores distintos após a normalização (02/09):** `Comprovante` (219), `PIX` (127), `Boleto` (59), `Transferência Bancária` (9), `Débito Automático` (9), `Dinheiro` (7), e `null` (369, contas ainda não pagas). Não existe CHECK na coluna; os rótulos válidos continuam sendo os de `METODOS_PAGAMENTO`: `PIX`, `Transferência Bancária`, `Cartão de Crédito`, `Cartão de Débito`, `Débito Automático`, `Boleto`, `Cheque`, `Dinheiro`, `Comprovante`.
- **App:** toggle "Débito automático" em Nova Conta e Editar Conta; badge "Débito automático" na coluna de código do mês (não pede código, não alerta "Coletar"); baixa (PagarContaModal) já sugere método "Débito Automático".
- **Agenda (espelhos "Pagar:")**: conta em débito automático **não ganha espelho** na Agenda (sync `agenda_sync_contas_pagar` v6, migration servidor `20260902121658`): não há ação manual a lembrar, e o digest "a pagar hoje" da Ana/Rose deixa de somar dinheiro que sai sozinho. **Espelho "Pagar:" que já existe quando alguém liga a flag depois: o sync v6 o APAGA** (`delete`, não cancela nem conclui) na passada de órfãs do ciclo seguinte do cron 18 (≤ 10 min), com as mesmas exceções das outras órfãs — fica se tiver filha ativa (`pendente/em_andamento/adiada`) ou se for `recorrencia_pai_id` de outra tarefa, até isso se resolver. O delete cascateia `lembretes_log` e subtarefas do espelho. Desligar a flag faz o espelho nascer de novo no ciclo seguinte (novo id). Consequência para a Maria: `maria_agenda_listar` não mostra essas contas como "Pagar:"; a visibilidade delas fica na lista do dia do WhatsApp e na `vw_maria_contas_pagar`.
- **Backfill complementar (v6):** instâncias pendentes de modelos flagados que nasceram antes da flag (Light 164 ×3 em set/2026) receberam a flag.
- **Lista do dia** (edge `contas-pagar-dia-gerar` e `whatsapp-grupo-dispatcher`, ambas deployadas; e o painel do app): conta flagada sai **por último** no bloco da unidade, com a linha `🔁 DÉBITO AUTOMÁTICO — não pagar manualmente` no lugar do código, e o cabeçalho ganha `🔁 *Em débito automático:* R$ X` logo abaixo do Total Geral (o total geral continua somando — o dinheiro sai da conta do mesmo jeito).

## 1. O que a Maria precisa (fase 2)

1. **Ler a flag.** `vw_maria_contas_pagar` lista colunas explícitas (23 hoje) — acrescentar `debito_automatico` (`create or replace view`); é a única view que **precisa** da coluna. A `vw_maria_contas_eventuais` (colunas explícitas, filtra `tipo_lancamento = 'eventual'`) **não precisa**: conta eventual nunca recebe a flag (o app força `false` em Nova e Editar; hoje 0 eventuais flagadas, as 27 são `recorrente`) — incluir lá só se quiserem o mesmo shape nas duas views. A tabela já tem a policy `maria_select_contas_pagar`, então a leitura direta também funciona.
2. **Criar já com a flag.** `maria_contas_unica_criar`, `maria_contas_recorrente_criar`, `maria_contas_parcelada_criar`, `maria_contas_eventual_criar`: novo parâmetro `p_debito_automatico boolean default false`, gravado na coluna. Na recorrente, vale para o modelo (as instâncias herdam).
3. **Ligar/desligar numa conta existente.** RPC nova, sugestão: `maria_contas_definir_debito_automatico(p_conta_id uuid, p_debito_automatico boolean, p_aplicar_futuros boolean default true, <contexto do ator>)` — mesmo molde das outras (`maria_assert_actor`, `for update`, `maria_audit_log`, retorno `{success, id, resumo}`). Com `p_aplicar_futuros` e conta recorrente: atualiza o modelo e as instâncias pendentes de competência futura, como o app faz. Grant E (`service_role, maria_operacional`).
4. **Baixa.** `maria_contas_dar_baixa` (e `_com_comprovante`): se `p_metodo_pagamento` vier nulo/vazio e a conta tiver `debito_automatico = true`, assumir `'Débito Automático'` (já está na allowlist). Comprovante continua opcional como hoje.
5. **Código do mês.** `maria_contas_codigo_mes_registrar` e `maria_contas_codigo_mes_marcar_indisponivel`: em conta flagada, recusar com hint em português (`'conta em débito automático: não há código do mês para coletar.'`, errcode `P0001`) — evita a Maria pedir código para o que se paga sozinho.
6. **Allowlist/tools do MCP:** expor o parâmetro novo nas tools de criar e a RPC de ligar/desligar aos papéis operacionais (`owner_full`, `finance_ops_write_safe`, `finance_assistant_write_safe`); leitura para todos que já leem contas.
7. **Laudo/lista do dia da Maria:** se ela montar a própria lista a partir da view (e não da edge), aplicar a mesma regra: flagada por último, sem código, com o marcador e o subtotal.

## 2. Verificação sugerida (read-only)

```sql
select count(*) filter (where debito_automatico) as flagadas,
       count(*) filter (where debito_automatico and status = 'pendente') as pendentes
  from public.contas_pagar;                                   -- 24 / 7 em 02/09
select column_name from information_schema.columns
 where table_name = 'vw_maria_contas_pagar' and column_name = 'debito_automatico';  -- 1 linha após a fase 2
```

## 3. Fronteira

Coluna, backfill, app, edges e materializador são do Super Folha (feitos). Views `vw_maria_*`, RPCs `maria_contas_*`, allowlist e tools são do lado da Maria. Nenhum objeto `maria_*` nem `vw_maria_*` foi criado, alterado ou concedido por este repo nesta entrega (as duas views têm owner `postgres` e nasceram fora das migrations deste repo — são do lado da Maria). O que este repo tocou no banco: `contas_pagar` (coluna, backfill, índice) e `agenda_sync_contas_pagar` (v6).
