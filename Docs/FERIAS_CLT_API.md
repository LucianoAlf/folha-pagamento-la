# 🔧 Documentação Técnica: API de Férias CLT

**Sistema de Gestão de Férias CLT - LA Music**
Versão 1.0 | Data: 07/02/2026

---

## 📋 Índice

1. [Arquitetura](#arquitetura)
2. [Banco de Dados](#banco-de-dados)
3. [Edge Functions](#edge-functions)
4. [Service Layer](#service-layer)
5. [Componentes React](#componentes-react)
6. [Validações CLT](#validações-clt)
7. [Cron Jobs](#cron-jobs)
8. [Fluxos de Dados](#fluxos-de-dados)

---

## 🏗️ Arquitetura

### Stack Tecnológica:

```
┌─────────────────────────────────────────┐
│          Frontend (React/TS)            │
│  - Components: FeriasPage, Modals      │
│  - Services: feriasService.ts          │
│  - Utils: Calculations, Validations    │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│       Supabase (PostgreSQL)             │
│  - Tables: periodos, programacoes      │
│  - Views: v_ferias_colaboradores       │
│  - Functions: SQL (calculos)           │
│  - RLS Policies (segurança)            │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Edge Functions (Deno)            │
│  - ferias-calcular-periodos            │
│  - ferias-ai-insights (Gemini)         │
│  - whatsapp-ferias-alertas (UAZAPI)    │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Integrações Externas            │
│  - Google Gemini API (IA)              │
│  - UAZAPI (WhatsApp)                   │
└─────────────────────────────────────────┘
```

---

## 🗄️ Banco de Dados

### Tabela: `ferias_periodos_aquisitivos`

Armazena os períodos de 12 meses trabalhados (aquisitivo) e concessivo.

```sql
CREATE TABLE ferias_periodos_aquisitivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  colaborador_id INT NOT NULL REFERENCES colaboradores(id),

  -- Período Aquisitivo (12 meses trabalhados)
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,

  -- Período Concessivo (12 meses para gozar)
  concessivo_inicio DATE NOT NULL,
  concessivo_fim DATE NOT NULL,

  -- Direitos e Saldos
  dias_direito INT NOT NULL DEFAULT 30,
  dias_gozados INT NOT NULL DEFAULT 0,
  dias_vendidos INT NOT NULL DEFAULT 0,
  dias_saldo INT GENERATED ALWAYS AS (dias_direito - dias_gozados - dias_vendidos) STORED,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  esta_vencido BOOLEAN GENERATED ALWAYS AS (
    concessivo_fim < CURRENT_DATE AND dias_saldo > 0
  ) STORED,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Campos Computed (Automáticos):**
- `dias_saldo`: Calcula automaticamente (direito - gozados - vendidos)
- `esta_vencido`: TRUE se concessivo expirou e ainda tem saldo

**Índices:**
```sql
CREATE INDEX idx_ferias_periodos_colaborador ON ferias_periodos_aquisitivos(colaborador_id);
CREATE INDEX idx_ferias_periodos_status ON ferias_periodos_aquisitivos(status);
CREATE INDEX idx_ferias_periodos_vencido ON ferias_periodos_aquisitivos(esta_vencido) WHERE esta_vencido = true;
```

---

### Tabela: `ferias_programacoes`

Armazena as programações de férias com datas, status e pagamento.

```sql
CREATE TABLE ferias_programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  colaborador_id INT NOT NULL REFERENCES colaboradores(id),
  periodo_aquisitivo_id UUID NOT NULL REFERENCES ferias_periodos_aquisitivos(id),

  -- Datas
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dias_corridos INT NOT NULL,
  dias_uteis INT NOT NULL,

  -- Abono Pecuniário
  vendeu_abono BOOLEAN DEFAULT FALSE,
  dias_abono INT DEFAULT 0,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'programado',

  -- Pagamento
  data_limite_pagamento DATE GENERATED ALWAYS AS (data_inicio - INTERVAL '2 days') STORED,
  pagamento_efetuado BOOLEAN DEFAULT FALSE,
  data_pagamento DATE,
  valor_pagamento DECIMAL(10,2),
  observacoes_pagamento TEXT,

  -- Aprovação
  aprovado_por UUID REFERENCES auth.users,
  aprovado_em TIMESTAMPTZ,

  -- Observações
  observacoes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Status possíveis:**
- `programado`: Criado, aguardando ação
- `aprovado`: Aprovado por gestor
- `em_gozo`: Colaborador está de férias
- `concluido`: Férias finalizadas
- `cancelado`: Cancelado antes de iniciar

---

### View: `v_ferias_colaboradores_status`

View consolidada com status de férias de todos os colaboradores CLT.

```sql
CREATE VIEW v_ferias_colaboradores_status AS
SELECT
  c.id AS colaborador_id,
  c.user_id,
  c.nome,
  c.departamento,
  c.unidade,
  c.data_admissao,
  c.salario_base,
  c.tipo_contrato,

  -- Agregações de períodos
  COUNT(DISTINCT pa.id) AS total_periodos,
  COUNT(DISTINCT pa.id) FILTER (WHERE pa.status = 'ativo') AS periodos_ativos,
  SUM(pa.dias_saldo) FILTER (WHERE pa.status = 'ativo') AS total_dias_saldo,

  -- Flags de alerta
  BOOL_OR(pa.esta_vencido) AS tem_ferias_vencidas,
  MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo' AND pa.dias_saldo > 0) AS proxima_expiracao,

  -- Status geral
  CASE
    WHEN BOOL_OR(pa.esta_vencido) THEN 'critico'
    WHEN MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo') < CURRENT_DATE + INTERVAL '30 days' THEN 'alerta'
    WHEN MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo') < CURRENT_DATE + INTERVAL '60 days' THEN 'atencao'
    ELSE 'ok'
  END AS status_ferias

FROM colaboradores c
LEFT JOIN ferias_periodos_aquisitivos pa ON pa.colaborador_id = c.id
WHERE c.tipo_contrato = 'clt'
GROUP BY c.id;
```

**Uso:**
```sql
-- Buscar todos com férias vencidas
SELECT * FROM v_ferias_colaboradores_status
WHERE tem_ferias_vencidas = true
ORDER BY proxima_expiracao ASC;
```

---

### Function: `calcular_periodos_aquisitivos`

Calcula e insere períodos aquisitivos baseado na data de admissão.

```sql
CREATE OR REPLACE FUNCTION calcular_periodos_aquisitivos(
  p_colaborador_id INT DEFAULT NULL
)
RETURNS TABLE (
  colaboradores_processados INT,
  periodos_gerados INT
) AS $$
DECLARE
  v_colaborador RECORD;
  v_periodo_inicio DATE;
  v_periodo_fim DATE;
  v_concessivo_inicio DATE;
  v_concessivo_fim DATE;
  v_total_colab INT := 0;
  v_total_periodos INT := 0;
BEGIN
  -- Loop por colaboradores CLT
  FOR v_colaborador IN
    SELECT * FROM colaboradores
    WHERE tipo_contrato = 'clt'
      AND ativo = true
      AND (p_colaborador_id IS NULL OR id = p_colaborador_id)
  LOOP
    v_total_colab := v_total_colab + 1;
    v_periodo_inicio := v_colaborador.data_admissao;

    -- Gerar períodos até hoje
    WHILE v_periodo_inicio < CURRENT_DATE LOOP
      v_periodo_fim := v_periodo_inicio + INTERVAL '12 months' - INTERVAL '1 day';
      v_concessivo_inicio := v_periodo_fim + INTERVAL '1 day';
      v_concessivo_fim := v_concessivo_inicio + INTERVAL '12 months' - INTERVAL '1 day';

      -- Inserir se não existir
      INSERT INTO ferias_periodos_aquisitivos (
        user_id, colaborador_id,
        data_inicio, data_fim,
        concessivo_inicio, concessivo_fim,
        status
      )
      VALUES (
        v_colaborador.user_id, v_colaborador.id,
        v_periodo_inicio, v_periodo_fim,
        v_concessivo_inicio, v_concessivo_fim,
        CASE
          WHEN v_concessivo_fim < CURRENT_DATE THEN 'vencido'
          WHEN v_periodo_fim > CURRENT_DATE THEN 'em_aquisicao'
          ELSE 'ativo'
        END
      )
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        v_total_periodos := v_total_periodos + 1;
      END IF;

      v_periodo_inicio := v_periodo_fim + INTERVAL '1 day';
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_total_colab, v_total_periodos;
END;
$$ LANGUAGE plpgsql;
```

---

## 🚀 Edge Functions

### 1. `ferias-calcular-periodos`

**Endpoint:** `POST /functions/v1/ferias-calcular-periodos`

**Headers:**
```json
{
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json"
}
```

**Body (opcional):**
```json
{
  "colaboradorId": 123  // null = todos os CLT
}
```

**Response:**
```json
{
  "success": true,
  "colaboradoresProcessados": 25,
  "periodosGerados": 47
}
```

**Código de Referência:**
```typescript
// Chamar a function SQL
const { data, error } = await supabase.rpc(
  'calcular_periodos_aquisitivos',
  { p_colaborador_id: colaboradorId }
);
```

---

### 2. `ferias-ai-insights`

**Endpoint:** `POST /functions/v1/ferias-ai-insights`

**Headers:**
```json
{
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "periodoReferencia": "2025-Q2",  // ou "2025-07"
  "departamento": "staff_rateado", // opcional
  "unidade": "matriz",             // opcional
  "force": false                   // true = ignora cache
}
```

**Response:**
```json
{
  "success": true,
  "cached": false,
  "generatedAt": "2026-02-07T10:30:00Z",
  "data": {
    "analise_executiva": "...",
    "situacoes_criticas": [...],
    "sugestoes_distribuicao": [...],
    "impacto_financeiro": {...},
    "distribuicao_departamentos": {...},
    "recomendacoes_operacionais": [...]
  }
}
```

**Cache:**
- Armazenado em `ferias_ai_insights` table
- Válido por 24 horas
- Hash SHA256 do input para deduplicação

---

### 3. `whatsapp-ferias-alertas`

**Endpoint:** `POST /functions/v1/whatsapp-ferias-alertas`

**Headers:**
```json
{
  "x-cron-secret": "<CRON_SECRET>",
  "Content-Type": "application/json"
}
```

**Body:** `{}`

**Response:**
```json
{
  "success": true,
  "enviados": 5,
  "ignorados": 12,
  "erros": []
}
```

**Tipos de Alertas Enviados:**
1. Férias vencidas (CRÍTICO)
2. Concessivo próximo de vencer
3. Pagamento pendente
4. Resumo mensal (se configurado)

**Idempotência:**
- Verifica `lembretes_log` antes de enviar
- Não reenvia alertas já enviados nas últimas 24h

---

## 📦 Service Layer

### `feriasService.ts`

Camada de abstração para todas as operações de férias.

**Principais Métodos:**

```typescript
// Períodos Aquisitivos
fetchPeriodosAquisitivos(colaboradorId: number): Promise<FeriasPeriodoAquisitivo[]>

// Programações
fetchProgramacoes(filters?: FeriasProgramacaoFiltros): Promise<FeriasProgramacao[]>
createProgramacao(data: Partial<FeriasProgramacao>): Promise<FeriasProgramacao>
updateProgramacao(id: string, patch: Partial<FeriasProgramacao>): Promise<FeriasProgramacao>
cancelProgramacao(id: string): Promise<FeriasProgramacao>
registrarPagamento(id: string, data: {...}): Promise<FeriasProgramacao>

// Status Consolidado
fetchColaboradoresStatus(filtros?: FeriasColaboradorFiltros): Promise<FeriasColaboradorStatus[]>

// Cálculos
calcularPeriodos(colaboradorId?: number): Promise<{success: boolean, ...}>
calcularValorFerias(colaboradorId: number, diasUteis: number, diasAbono: number): Promise<number>

// IA
gerarInsightsIA(params: {...}): Promise<{success: boolean, data: FeriasAiInsightsJson, ...}>
```

**Exemplo de Uso:**
```typescript
import { feriasService } from '@/services/feriasService';

// Buscar status de todos os colaboradores
const colaboradores = await feriasService.fetchColaboradoresStatus({
  ordenacao: 'proxima_expiracao',
  status_ferias: 'critico'
});

// Criar programação
const programacao = await feriasService.createProgramacao({
  colaborador_id: 123,
  periodo_aquisitivo_id: 'uuid...',
  data_inicio: '2025-12-15',
  data_fim: '2026-01-05',
  dias_corridos: 22,
  dias_uteis: 15,
  vendeu_abono: true,
  dias_abono: 7
});
```

---

## ⚛️ Componentes React

### Estrutura de Arquivos:

```
components/ferias/
├── FeriasPage.tsx                    # Página principal (5 tabs)
├── FeriasSummaryCards.tsx            # KPIs do dashboard
├── FeriasColaboradorCard.tsx         # Card de status do colaborador
├── FeriasColaboradorList.tsx         # Lista com lazy loading
├── FeriasProgramacoesList.tsx        # Lista de programações
├── ProgramarFeriasModal.tsx          # Wizard 6 steps (★)
├── EditarProgramacaoModal.tsx        # Modal de edição
├── RegistrarPagamentoModal.tsx       # Modal de pagamento
└── FeriasAiInsightsPanel.tsx         # Panel de IA (premium) (★)
```

### Componente Destaque: `ProgramarFeriasModal`

**Props:**
```typescript
interface ProgramarFeriasModalProps {
  isOpen: boolean;
  onClose: () => void;
  colaborador: FeriasColaboradorStatus;
  onSuccess: () => void;
}
```

**6 Steps do Wizard:**
1. **Período Aquisitivo**: Seleção com radio buttons
2. **Datas**: DatePickers com cálculo automático
3. **Abono**: Checkbox + input de dias
4. **Confirmação**: Resumo + cálculo de valores
5. **Observações**: Textarea opcional
6. **Revisão**: Tudo junto + botão confirmar

**Validações em Tempo Real:**
- Usa `validarProgramacaoFerias()` de `utils/feriasValidations.ts`
- Exibe erros e avisos dinamicamente
- Bloqueia avanço se houver erros

---

## ✅ Validações CLT

### `feriasValidations.ts`

Todas as validações da legislação CLT.

**Funções Principais:**

```typescript
// 1. Dias mínimos
validarDiasMinimos(
  diasUteis: number,
  isPrimeiroPeriodo: boolean,
  ehPeriodoUnico: boolean
): { valido: boolean; erro?: string }

// Regras:
// - Período único: 1-30 dias
// - Primeiro fracionado: mín 14 dias
// - Demais fracionados: mín 5 dias

// 2. Abono pecuniário
validarAbono(
  diasAbono: number,
  diasTotal: number
): { valido: boolean; erro?: string }

// Regras:
// - Máximo 10 dias
// - Máximo 1/3 do total

// 3. Dentro do concessivo
validarDentroConcessivo(
  dataInicio: Date,
  dataFim: Date,
  periodo: FeriasPeriodoAquisitivo
): { valido: boolean; erro?: string }

// Regras:
// - Início >= concessivo_inicio
// - Fim <= concessivo_fim

// 4. Saldo suficiente
validarSaldo(
  diasUteis: number,
  diasAbono: number,
  periodo: FeriasPeriodoAquisitivo
): { valido: boolean; erro?: string }

// 5. Validação completa
validarProgramacaoFerias(input: {...}): {
  valido: boolean;
  erros: string[];
  avisos: string[];
}
```

---

## ⏰ Cron Jobs

### Job 1: Atualização de Status (Diário)

**Schedule:** `0 1 * * *` (01:00 AM)

```sql
SELECT cron.schedule(
  'ferias-atualizar-status-diario',
  '0 1 * * *',
  $$ SELECT public.atualizar_status_periodos_ferias(); $$
);
```

**Função SQL:**
```sql
CREATE FUNCTION atualizar_status_periodos_ferias()
RETURNS void AS $$
BEGIN
  -- Marcar vencidos
  UPDATE ferias_periodos_aquisitivos
  SET status = 'vencido'
  WHERE concessivo_fim < CURRENT_DATE
    AND dias_saldo > 0
    AND status = 'ativo';

  -- Atualizar programações em gozo
  UPDATE ferias_programacoes
  SET status = 'em_gozo'
  WHERE data_inicio <= CURRENT_DATE
    AND data_fim >= CURRENT_DATE
    AND status = 'aprovado';

  -- Concluir programações finalizadas
  UPDATE ferias_programacoes
  SET status = 'concluido'
  WHERE data_fim < CURRENT_DATE
    AND status = 'em_gozo';
END;
$$ LANGUAGE plpgsql;
```

---

### Job 2: Alertas WhatsApp (5 minutos)

**Schedule:** `*/5 * * * *` (a cada 5 minutos)

```sql
SELECT cron.schedule(
  'ferias-whatsapp-alertas',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/whatsapp-ferias-alertas',
      headers := jsonb_build_object(
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

**Requisitos:**
- `CRON_SECRET` configurado no Supabase
- Edge function `whatsapp-ferias-alertas` deployada
- UAZAPI configurado

---

## 🔄 Fluxos de Dados

### Fluxo 1: Cálculo de Períodos

```
User clica "Calcular Períodos"
    ↓
feriasService.calcularPeriodos()
    ↓
Edge Function: ferias-calcular-periodos
    ↓
SQL Function: calcular_periodos_aquisitivos()
    ↓
INSERT em ferias_periodos_aquisitivos
    ↓
Retorna: {success, colaboradoresProcessados, periodosGerados}
    ↓
UI atualiza: loadData()
```

---

### Fluxo 2: Programar Férias

```
User abre modal ProgramarFeriasModal
    ↓
Busca períodos disponíveis (fetchPeriodosAquisitivos)
    ↓
User preenche 6 steps do wizard
    ↓
Validação em tempo real (validarProgramacaoFerias)
    ↓
User confirma no Step 6
    ↓
feriasService.createProgramacao()
    ↓
INSERT em ferias_programacoes
    ↓
Trigger: atualiza dias_gozados do período
    ↓
UI recarrega: loadData()
```

---

### Fluxo 3: Alertas WhatsApp

```
Cron job executa a cada 5 min
    ↓
Edge Function: whatsapp-ferias-alertas
    ↓
Busca notificacao_config de todos os users
    ↓
Para cada user:
    ├─ Busca férias vencidas (SQL function)
    ├─ Busca próximas de vencer (query)
    ├─ Busca pagamentos pendentes (query)
    └─ Verifica resumo mensal (se dia/hora bate)
    ↓
Para cada alerta:
    ├─ Verifica idempotência (lembretes_log)
    ├─ Gera mensagem WhatsApp
    ├─ Envia via UAZAPI
    └─ Registra em lembretes_log
    ↓
Retorna: {enviados, ignorados, erros}
```

---

### Fluxo 4: Insights de IA

```
User clica "Gerar Análise"
    ↓
feriasService.gerarInsightsIA()
    ↓
Edge Function: ferias-ai-insights
    ↓
Gera hash do input
    ↓
Verifica cache (ferias_ai_insights table)
    ↓
Se cache válido (< 24h):
    └─ Retorna cache
Se não:
    ├─ Busca colaboradores (v_ferias_colaboradores_status)
    ├─ Busca programações (ferias_programacoes)
    ├─ Monta prompt com contexto CLT + LA Music
    ├─ Chama Gemini API (gemini-2.0-flash-exp)
    ├─ Parse JSON response
    ├─ Salva em cache (INSERT ferias_ai_insights)
    └─ Retorna insights
    ↓
FeriasAiInsightsPanel renderiza
```

---

## 🔐 Segurança

### RLS Policies

Todas as tabelas usam Row Level Security:

```sql
-- Exemplo: ferias_periodos_aquisitivos
ALTER TABLE ferias_periodos_aquisitivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data"
  ON ferias_periodos_aquisitivos FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own data"
  ON ferias_periodos_aquisitivos FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own data"
  ON ferias_periodos_aquisitivos FOR UPDATE
  USING (user_id = auth.uid());
```

---

## 📊 Monitoramento

### Métricas Importantes:

1. **Taxa de Férias Vencidas**: `tem_ferias_vencidas / total_colaboradores`
2. **Tempo Médio até Vencimento**: `AVG(dias_até_vencimento)`
3. **Taxa de Utilização do Sistema**: `programacoes_criadas / periodos_ativos`
4. **Alertas WhatsApp Enviados**: Count em `lembretes_log`
5. **Cache Hit Rate IA**: `cached_responses / total_requests`

### Queries de Monitoramento:

```sql
-- Colaboradores em risco
SELECT COUNT(*)
FROM v_ferias_colaboradores_status
WHERE status_ferias IN ('critico', 'alerta');

-- Programações sem pagamento
SELECT COUNT(*)
FROM ferias_programacoes
WHERE pagamento_efetuado = false
  AND data_limite_pagamento < CURRENT_DATE;

-- Uso de IA (últimos 30 dias)
SELECT COUNT(*), AVG(extract(epoch from (NOW() - created_at)))
FROM ferias_ai_insights
WHERE created_at >= NOW() - INTERVAL '30 days';
```

---

## 🚨 Troubleshooting

### Problema: Períodos não estão sendo calculados

**Diagnóstico:**
```sql
SELECT * FROM colaboradores
WHERE tipo_contrato = 'clt' AND ativo = true;
```

**Solução:**
- Verificar se `tipo_contrato = 'clt'`
- Verificar se `data_admissao` está preenchida
- Executar manualmente: `SELECT calcular_periodos_aquisitivos(colaborador_id);`

---

### Problema: Alertas WhatsApp não estão enviando

**Diagnóstico:**
```sql
SELECT * FROM notificacao_config
WHERE whatsapp_ativo = true
  AND whatsapp_numero IS NOT NULL;

SELECT * FROM lembretes_log
ORDER BY enviado_em DESC
LIMIT 10;
```

**Solução:**
1. Verificar se `UAZAPI_URL` e `UAZAPI_TOKEN` estão configurados
2. Verificar se `ferias_alerta_*` flags estão ativas em `notificacao_config`
3. Checar logs da edge function
4. Testar manualmente: `curl -X POST .../whatsapp-ferias-alertas`

---

### Problema: IA retornando erro

**Diagnóstico:**
- Verificar `GEMINI_API_KEY`
- Checar quota da API Gemini
- Ver logs da edge function

**Solução:**
```bash
# Verificar deployment
supabase functions deploy ferias-ai-insights

# Ver logs
supabase functions logs ferias-ai-insights
```

---

## 📝 Changelog

### v1.0 (07/02/2026)
- ✅ Sistema completo de férias CLT
- ✅ Cálculo automático de períodos
- ✅ Wizard de programação (6 steps)
- ✅ CRUD completo (editar, cancelar, pagar)
- ✅ Alertas WhatsApp (4 tipos)
- ✅ Insights de IA com Gemini
- ✅ Dashboard e KPIs
- ✅ Validações CLT completas
- ✅ RLS e segurança

---

**Desenvolvido para LA Music Group**
Documentação Técnica - Sistema de Férias CLT v1.0
