# Recorrência semanal em Contas a Pagar — Design

**Data:** 2026-08-29 · **Autor:** Alf + Claude · **Status:** aprovado para plano

## 1. Contexto e problema

Hoje Contas a Pagar só tem recorrência **mensal**. A Rose pediu recorrência
**semanal** para contas que se repetem toda semana e ela esquece — faxina/limpeza
semanal do Recreio, segurança. Sem isso, ela só lembra no fim do dia ou pede pro Tom.

O objetivo é: (1) deixar a Rose (e a Maria, via WhatsApp) cadastrarem uma conta
recorrente **semanal**, e (2) fazer cada ocorrência aparecer sozinha no relatório
diário das 08:00, no dia certo — que é o lembrete que ela quer.

### Como a recorrência mensal funciona hoje (medido)

- O **modelo** é a própria linha em `contas_pagar` com `tipo_lancamento='recorrente'`
  e `recorrente_modelo_id IS NULL`. Ela é template **e** a 1ª ocorrência.
- Instâncias de meses seguintes são linhas com `recorrente_modelo_id = modelo.id`,
  `competencia` = 1º dia do mês, `data_vencimento` = mesmo dia-do-mês.
- `ensureRecorrentesInstancias(admin, 'YYYY-MM')` (em
  `supabase/functions/_shared/recorrentesMes.ts`) gera **1 instância por mês** por
  modelo, pulando o mês de início (o modelo já o representa). Dedup em código por
  "o modelo já tem instância neste mês" (`geradosSet`).
- **Não existe** coluna de frequência, dia-da-semana, nem constraint única em
  `contas_pagar` (o `ON CONFLICT (recorrente_modelo_id, competencia)` tem fallback
  para insert quando a constraint não existe — e ela não existe em produção).
- Chamadores da materialização:
  - `whatsapp-grupo-dispatcher` (cron 5min que envia o relatório das 08:00) chama
    `ensureRecorrentesInstancias(mês corrente)` **antes** de montar a mensagem
    (verificado, ~linha 243).
  - O front também dispara a materialização ao abrir a tela de Contas a Pagar
    (conforme comentários no código); o mecanismo exato não é carga deste design.
- A Maria cria recorrentes via RPC `maria_contas_recorrente_criar` (SECURITY DEFINER,
  valida ator/plano/centro, checa duplicidade por competência-mês, insere com
  `tipo_lancamento='recorrente'` e `competencia = date_trunc('month', vencimento)`,
  audita em `maria_audit_log`). **Sem parâmetro de frequência** → hoje é sempre mensal.
  Essa RPC **não está versionada neste repo** (foi criada direto no banco).
- O relatório das 08:00 (`relatorioContasDia.ts`) lista por `data_vencimento = hoje`.
  `dedupeRecorrentesVisao` esconde a linha-modelo num mês onde exista instância dela.

### A raiz do problema

A identidade de uma instância recorrente é hoje `(modelo, competência-mês)` — 1 por
mês. Semanal quebra isso: 4–5 ocorrências no mesmo mês colidem nessa chave. A correção
central é **mover a identidade para a data** (`modelo + data_vencimento`), que serve
para mensal (datas de meses diferentes nunca colidem) e semanal.

## 2. Decisões (definidas com o Alf)

1. **Dia da semana = data da 1ª ocorrência.** A Rose escolhe a data da primeira
   ocorrência (ex.: sexta 15/08) e repete toda sexta. Sem seletor de dia-da-semana
   separado; o weekday é derivado da data-âncora.
2. **Só `mensal` + `semanal`** agora. Mecanismo fica pronto para quinzenal depois.
3. **Sem data-fim.** Roda até alguém cancelar/arquivar o modelo — igual mensal.
4. **Confiabilidade das 08:00 já coberta** pelo dispatcher (ver §5.3): assim que o
   materializador virar weekly-aware, o envio automático já cria as ocorrências
   semanais do mês. Sem código novo no caminho automático.
5. **Handoff da Maria** vai para o repo `maria-backup` (privado, da Maria) — **nunca**
   no repo do TOM (LA-Organizer). A RPC (banco) eu altero aqui; o outro chat ensina
   a Maria a chamá-la.

## 3. Modelo de dados

- Nova coluna em `contas_pagar`:
  `recorrente_frequencia text NOT NULL DEFAULT 'mensal'`
  `CHECK (recorrente_frequencia IN ('mensal','semanal'))`.
  Só é semanticamente relevante no modelo; o materializador copia todos os campos do
  modelo para a instância, então a instância herda a frequência automaticamente.
- Novo índice único parcial:
  `UNIQUE (recorrente_modelo_id, data_vencimento) WHERE recorrente_modelo_id IS NOT NULL`.
  Torna a materialização idempotente e à prova de corrida, para mensal e semanal.
  Verificado: **não há duplicatas** `(recorrente_modelo_id, data_vencimento)` hoje, então
  o índice pode ser criado sem limpeza.

## 4. Materialização (o coração)

`ensureRecorrentesInstancias(admin, 'YYYY-MM')` continua sendo a fronteira "materializar
um mês". O semanal **abre em leque dentro do mês**:

- **mensal** (ou `NULL`, legado): comportamento atual intacto — 1 instância/mês, mesmo
  dia-do-mês, pula o mês de início.
- **semanal**: ocorrências = âncora (`modelo.data_vencimento`), +7, +14… que caem **no
  mês alvo** e são **> âncora** (a âncora já é o modelo, como no mensal com o 1º mês).
  Cada instância: `data_vencimento` = a data da ocorrência; `competencia` =
  `date_trunc('month', ocorrência)` (DRE e buckets mensais continuam corretos).
- **Dedup passa a ser por data**: `(recorrente_modelo_id, data_vencimento)`, via o novo
  índice (`onConflict` atualizado) + checagem em código. Preserva 100% o mensal.

`dedupeRecorrentesVisao` (em `relatorioContasDia.ts`) passa a chavear por
`recorrente_modelo_id + data_vencimento` em vez de `+ mês`. Efeito: o modelo só é
escondido se existir instância na **mesma data** dele — o que nunca acontece (o
materializador pula a âncora). Preserva o comportamento mensal e conserta o semanal
(a 1ª ocorrência semanal, que é o modelo, não some do relatório).

## 5. Componentes

### 5.1 Schema (migration)
Coluna `recorrente_frequencia` + índice único parcial (§3).

### 5.2 Materializador (`_shared/recorrentesMes.ts` + teste)
Weekly-aware conforme §4. Função auxiliar para enumerar as datas semanais de um mês a
partir da âncora. Idempotente.

### 5.3 Confiabilidade das 08:00
O `whatsapp-grupo-dispatcher` já materializa o mês corrente antes de montar a mensagem
(linha ~243) → **sem mudança**. Para paridade no **preview manual**, o gerador
on-demand `contas-pagar-dia-gerar` passa a chamar `ensureRecorrentesInstancias(mês
corrente)` no início (idempotente, barato), para que o preview também mostre as
ocorrências semanais mesmo que ninguém tenha aberto a tela ainda.

### 5.4 UI (`components/contas/NovaContaModal.tsx` e `EditarContaModal.tsx`)
- Ao escolher **Recorrente**, aparece um toggle **Mensal / Semanal**.
- Em **Semanal**: o campo "Vencimento" passa a rotular "1ª ocorrência" com texto-guia
  _"Repete toda \<dia-da-semana\>"_ derivado da data escolhida. Competência = mês da
  data. Nenhum campo de dia-da-semana separado.
- O payload de `onConfirm` inclui `recorrente_frequencia`.
- `EditarContaModal`: **exibe** a frequência do modelo (read-only nesta fatia). Alterar a
  frequência de um modelo existente fica fora de escopo (mudaria ocorrências já geradas).

### 5.5 Maria — RPC (neste repo) + handoff (no maria-backup)
- **RPC** `maria_contas_recorrente_criar`: adicionar `p_frequencia text DEFAULT 'mensal'`
  (última posição), validar em `('mensal','semanal')`, e gravar `recorrente_frequencia`
  no insert. Como adicionar parâmetro muda a assinatura, a migration **dropa a função
  de 15 args e recria com 16** (o param novo com default mantém as chamadas de 15 args
  funcionando e evita overload ambíguo). **Preservar os grants** (capturar antes,
  re-conceder depois). Trazer a função ao versionamento deste repo nessa migration.
- **Handoff** (`maria-backup/planejamento/...`): documento explicando o conceito de
  frequência, a nova assinatura da RPC, e como a Maria mapeia a fala da Rose
  ("faxina toda sexta R$X" → `p_frequencia='semanal'` + próxima sexta como
  `p_data_vencimento`). Auditoria/confirmação inalteradas. **Não altero a Maria.**

## 6. Fluxo de dados — exemplo "faxina toda sexta, R$ 150, Recreio"

1. Rose (tela) ou Maria (WhatsApp) cria o modelo: `tipo_lancamento='recorrente'`,
   `recorrente_frequencia='semanal'`, `data_vencimento`=próxima sexta, `competencia`=mês.
2. No mês corrente, o dispatcher (08:00) chama o materializador → cria as sextas
   seguintes do mês como instâncias (`recorrente_modelo_id`=modelo, datas +7).
3. Todo dia às 08:00, o relatório lista o que vence **hoje**; na sexta, a faxina aparece.
4. Vira o mês → o dispatcher materializa o novo mês → novas sextas aparecem. Sem fim.

## 7. Casos de borda

- **Ocorrência no 1º dia do mês**: coberta quando o dispatcher materializa aquele mês.
- **Modelo criado no meio da semana**: a âncora define o weekday; ocorrências seguem +7.
- **Mês com 5 ocorrências**: todas geradas (o leque é por data dentro do mês).
- **Idempotência**: rodar o materializador N vezes no mesmo mês não duplica (índice único).
- **Código de barras/PIX** (`contas_pagar_codigo_mes`) é por `conta_pagar_id` → cada
  ocorrência semanal tem o seu; `pix_chave_fixa` do modelo é copiada para as instâncias.
- **DRE/competência**: cada ocorrência carrega o mês correto em `competencia`.

## 8. Testes

- `recorrentesMes.test.mjs`: casos semanais (leque no mês, borda de início/fim de mês,
  idempotência, dedup por data) + manter os mensais verdes.
- `relatorioContasDia.test.mjs`: garantir que a 1ª ocorrência semanal (o modelo) não é
  escondida pelo dedup, e que múltiplas ocorrências no mês aparecem cada uma no seu dia.
- `npm run typecheck` limpo; `deno check` nas edge functions tocadas (sem erros novos
  além do genérico do SDK).

## 9. Fora de escopo

Quinzenal e outras frequências; data-fim; parcelada/única/eventual/fatura/folha; rateio;
o modelo mensal existente; o formato da mensagem das 08:00; edição avançada de modelo
recorrente na UI.

## 10. Arquivos afetados

- `supabase/migrations/<novo>_recorrencia_semanal_schema.sql` — coluna + índice.
- `supabase/migrations/<novo>_maria_contas_recorrente_criar_frequencia.sql` — RPC.
- `supabase/functions/_shared/recorrentesMes.ts` (+ `.test.mjs`) — materializador.
- `supabase/functions/_shared/relatorioContasDia.ts` (+ `.test.mjs`) — dedup por data.
- `supabase/functions/contas-pagar-dia-gerar/index.ts` — materializar no preview.
- `components/contas/NovaContaModal.tsx`, `EditarContaModal.tsx` — toggle + payload.
- `services/contasPagarService.ts` / `types/contasPagar.ts` — campo `recorrente_frequencia`.
- `maria-backup` (repo separado) — documento de handoff.
