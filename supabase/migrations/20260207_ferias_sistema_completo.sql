-- =====================================================
-- SISTEMA DE CONTROLE DE FÉRIAS CLT - LA MUSIC GROUP
-- Data: 2026-02-07
-- Descrição: Migration completa para gestão de férias CLT
-- =====================================================

-- =====================================================
-- 1. TABELAS PRINCIPAIS
-- =====================================================

-- Tabela: ferias_periodos_aquisitivos
-- Armazena períodos de 12 meses trabalhados que geram direito a férias
CREATE TABLE IF NOT EXISTS public.ferias_periodos_aquisitivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id INTEGER NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,

  -- Período aquisitivo (12 meses trabalhados)
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,

  -- Período concessivo (12 meses após fim do aquisitivo para gozar)
  concessivo_inicio DATE NOT NULL,
  concessivo_fim DATE NOT NULL,

  -- Controle de saldo
  dias_direito INTEGER NOT NULL DEFAULT 30, -- Pode ser reduzido por faltas
  dias_gozados INTEGER NOT NULL DEFAULT 0,
  dias_vendidos INTEGER NOT NULL DEFAULT 0,
  dias_saldo INTEGER GENERATED ALWAYS AS (dias_direito - dias_gozados - dias_vendidos) STORED,

  -- Status do período
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'em_gozo', 'concluido', 'vencido')),

  -- Detalhes legais
  faltas_periodo INTEGER DEFAULT 0, -- Afeta quantidade de dias de direito
  observacoes TEXT,

  -- Alertas e conformidade
  alerta_concessivo_enviado BOOLEAN DEFAULT FALSE,
  esta_vencido BOOLEAN GENERATED ALWAYS AS (concessivo_fim < CURRENT_DATE AND (dias_direito - dias_gozados - dias_vendidos) > 0) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_periodo_aquisitivo CHECK (data_fim > data_inicio),
  CONSTRAINT valid_periodo_concessivo CHECK (concessivo_fim > concessivo_inicio),
  CONSTRAINT valid_dias_direito CHECK (dias_direito > 0 AND dias_direito <= 30),
  CONSTRAINT valid_dias_gozados CHECK (dias_gozados >= 0),
  CONSTRAINT valid_dias_vendidos CHECK (dias_vendidos >= 0 AND dias_vendidos <= 10),

  -- Unicidade: um colaborador não pode ter dois períodos com a mesma data de início
  UNIQUE(colaborador_id, data_inicio)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ferias_periodos_colaborador ON public.ferias_periodos_aquisitivos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ferias_periodos_status ON public.ferias_periodos_aquisitivos(status);
CREATE INDEX IF NOT EXISTS idx_ferias_periodos_concessivo_fim ON public.ferias_periodos_aquisitivos(concessivo_fim);
CREATE INDEX IF NOT EXISTS idx_ferias_periodos_vencidos ON public.ferias_periodos_aquisitivos(esta_vencido) WHERE esta_vencido = TRUE;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_ferias_periodos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ferias_periodos_updated_at_trigger
BEFORE UPDATE ON public.ferias_periodos_aquisitivos
FOR EACH ROW
EXECUTE FUNCTION update_ferias_periodos_updated_at();

-- Comentários
COMMENT ON TABLE public.ferias_periodos_aquisitivos IS 'Períodos aquisitivos e concessivos de férias CLT';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.data_inicio IS 'Início do período aquisitivo (12 meses trabalhados)';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.data_fim IS 'Fim do período aquisitivo';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.concessivo_inicio IS 'Início do período concessivo (prazo para gozar)';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.concessivo_fim IS 'Fim do período concessivo (após essa data = multa em dobro)';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.dias_saldo IS 'Saldo disponível (calculado automaticamente)';
COMMENT ON COLUMN public.ferias_periodos_aquisitivos.esta_vencido IS 'TRUE se passou do concessivo e ainda tem saldo (multa!)';

-- =====================================================
-- Tabela: ferias_programacoes
-- Armazena programações de férias (períodos de gozo)
CREATE TABLE IF NOT EXISTS public.ferias_programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_aquisitivo_id UUID NOT NULL REFERENCES public.ferias_periodos_aquisitivos(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,

  -- Datas de gozo
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dias_corridos INTEGER NOT NULL, -- Dias totais (incluindo fins de semana)
  dias_uteis INTEGER NOT NULL, -- Dias úteis descontados do saldo

  -- Abono pecuniário (venda de 1/3)
  vendeu_abono BOOLEAN NOT NULL DEFAULT FALSE,
  dias_abono INTEGER DEFAULT 0 CHECK (dias_abono >= 0 AND dias_abono <= 10),

  -- Status
  status TEXT NOT NULL DEFAULT 'programado' CHECK (status IN ('programado', 'aprovado', 'em_gozo', 'concluido', 'cancelado')),

  -- Pagamento (deve pagar até 2 dias antes)
  data_limite_pagamento DATE GENERATED ALWAYS AS (data_inicio - INTERVAL '2 days') STORED,
  pagamento_efetuado BOOLEAN DEFAULT FALSE,
  data_pagamento DATE,
  valor_pagamento NUMERIC(10,2),

  -- Aprovação/Gestão
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ,
  observacoes TEXT,

  -- Alertas
  alerta_pagamento_enviado BOOLEAN DEFAULT FALSE,
  alerta_inicio_enviado BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validações CLT
  CONSTRAINT valid_datas CHECK (data_fim >= data_inicio),
  CONSTRAINT valid_dias_corridos CHECK (dias_corridos > 0),
  CONSTRAINT valid_dias_uteis CHECK (dias_uteis >= 5 OR dias_uteis = dias_corridos),
  CONSTRAINT valid_abono CHECK (NOT vendeu_abono OR dias_abono > 0),
  CONSTRAINT valid_pagamento CHECK (NOT pagamento_efetuado OR (data_pagamento IS NOT NULL AND valor_pagamento IS NOT NULL))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ferias_prog_colaborador ON public.ferias_programacoes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ferias_prog_periodo ON public.ferias_programacoes(periodo_aquisitivo_id);
CREATE INDEX IF NOT EXISTS idx_ferias_prog_status ON public.ferias_programacoes(status);
CREATE INDEX IF NOT EXISTS idx_ferias_prog_datas ON public.ferias_programacoes(data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_ferias_prog_pagamento_pendente ON public.ferias_programacoes(data_limite_pagamento)
  WHERE status IN ('programado', 'aprovado') AND pagamento_efetuado = FALSE;

-- Trigger para updated_at
CREATE TRIGGER ferias_prog_updated_at_trigger
BEFORE UPDATE ON public.ferias_programacoes
FOR EACH ROW
EXECUTE FUNCTION update_ferias_periodos_updated_at();

-- Trigger para atualizar dias_gozados/dias_vendidos no período aquisitivo
CREATE OR REPLACE FUNCTION update_periodo_aquisitivo_saldos()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando criar ou atualizar programação, recalcular saldos do período
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status NOT IN ('cancelado') THEN
      UPDATE public.ferias_periodos_aquisitivos
      SET
        dias_gozados = (
          SELECT COALESCE(SUM(dias_uteis), 0)
          FROM public.ferias_programacoes
          WHERE periodo_aquisitivo_id = NEW.periodo_aquisitivo_id
            AND status NOT IN ('cancelado')
            AND vendeu_abono = FALSE
        ),
        dias_vendidos = (
          SELECT COALESCE(SUM(dias_abono), 0)
          FROM public.ferias_programacoes
          WHERE periodo_aquisitivo_id = NEW.periodo_aquisitivo_id
            AND status NOT IN ('cancelado')
            AND vendeu_abono = TRUE
        )
      WHERE id = NEW.periodo_aquisitivo_id;
    END IF;
  END IF;

  -- Quando deletar ou cancelar, recalcular
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status = 'cancelado') THEN
    UPDATE public.ferias_periodos_aquisitivos
    SET
      dias_gozados = (
        SELECT COALESCE(SUM(dias_uteis), 0)
        FROM public.ferias_programacoes
        WHERE periodo_aquisitivo_id = COALESCE(NEW.periodo_aquisitivo_id, OLD.periodo_aquisitivo_id)
          AND status NOT IN ('cancelado')
          AND id != COALESCE(NEW.id, OLD.id)
          AND vendeu_abono = FALSE
      ),
      dias_vendidos = (
        SELECT COALESCE(SUM(dias_abono), 0)
        FROM public.ferias_programacoes
        WHERE periodo_aquisitivo_id = COALESCE(NEW.periodo_aquisitivo_id, OLD.periodo_aquisitivo_id)
          AND status NOT IN ('cancelado')
          AND id != COALESCE(NEW.id, OLD.id)
          AND vendeu_abono = TRUE
      )
    WHERE id = COALESCE(NEW.periodo_aquisitivo_id, OLD.periodo_aquisitivo_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ferias_prog_update_saldos_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.ferias_programacoes
FOR EACH ROW
EXECUTE FUNCTION update_periodo_aquisitivo_saldos();

-- Comentários
COMMENT ON TABLE public.ferias_programacoes IS 'Programações de férias (períodos de gozo)';
COMMENT ON COLUMN public.ferias_programacoes.dias_uteis IS 'Dias úteis que serão descontados do saldo';
COMMENT ON COLUMN public.ferias_programacoes.vendeu_abono IS 'Se vendeu 1/3 das férias (abono pecuniário)';
COMMENT ON COLUMN public.ferias_programacoes.data_limite_pagamento IS 'Prazo legal para pagamento (2 dias antes)';

-- =====================================================
-- Tabela: ferias_ai_insights
-- Armazena análises de IA sobre distribuição de férias (PREMIUM)
CREATE TABLE IF NOT EXISTS public.ferias_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Escopo da análise
  periodo_referencia TEXT NOT NULL, -- Ex: "2025-Q1", "2025-07"
  departamento TEXT, -- null = todos
  unidade TEXT, -- null = todas

  -- Input/Cache
  model TEXT NOT NULL DEFAULT 'gemini-3-flash-preview',
  input_hash TEXT NOT NULL UNIQUE,

  -- Resposta
  summary TEXT,
  response_json JSONB NOT NULL,

  -- Metadados
  generated_by UUID REFERENCES auth.users(id),

  CONSTRAINT valid_response CHECK (response_json ? 'analise_executiva')
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ferias_ai_periodo ON public.ferias_ai_insights(periodo_referencia);
CREATE INDEX IF NOT EXISTS idx_ferias_ai_hash ON public.ferias_ai_insights(input_hash);
CREATE INDEX IF NOT EXISTS idx_ferias_ai_created ON public.ferias_ai_insights(created_at DESC);

COMMENT ON TABLE public.ferias_ai_insights IS 'Análises de IA para otimização de distribuição de férias (Premium)';

-- =====================================================
-- Tabela: ferias_historico_acoes
-- Auditoria de ações no sistema de férias
CREATE TABLE IF NOT EXISTS public.ferias_historico_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  user_id UUID NOT NULL REFERENCES auth.users(id),
  colaborador_id INTEGER REFERENCES public.colaboradores(id) ON DELETE SET NULL,

  acao TEXT NOT NULL, -- 'periodo_criado', 'ferias_programadas', 'ferias_aprovadas', 'pagamento_efetuado', etc
  entidade_tipo TEXT NOT NULL, -- 'periodo_aquisitivo', 'programacao'
  entidade_id UUID NOT NULL,

  detalhes JSONB,
  observacao TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ferias_historico_user ON public.ferias_historico_acoes(user_id);
CREATE INDEX IF NOT EXISTS idx_ferias_historico_colaborador ON public.ferias_historico_acoes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ferias_historico_created ON public.ferias_historico_acoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ferias_historico_acao ON public.ferias_historico_acoes(acao);

COMMENT ON TABLE public.ferias_historico_acoes IS 'Auditoria de todas as ações no sistema de férias';

-- =====================================================
-- 2. VIEWS
-- =====================================================

-- View: v_ferias_colaboradores_status
-- Status consolidado de férias por colaborador CLT
CREATE OR REPLACE VIEW public.v_ferias_colaboradores_status AS
SELECT
  c.id AS colaborador_id,
  c.nome,
  c.nome_completo,
  c.foto_url,
  c.funcao,
  c.departamento,
  c.data_admissao,
  c.status AS colaborador_status,
  c.salario_base,

  -- Períodos aquisitivos
  COUNT(pa.id) FILTER (WHERE pa.status = 'ativo') AS periodos_ativos,
  COUNT(pa.id) FILTER (WHERE pa.status = 'vencido') AS periodos_vencidos,
  SUM(pa.dias_saldo) FILTER (WHERE pa.status IN ('ativo', 'em_gozo')) AS total_dias_saldo,

  -- Situações críticas
  BOOL_OR(pa.esta_vencido) AS tem_ferias_vencidas,
  MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo' AND pa.dias_saldo > 0) AS proxima_expiracao,

  -- Férias programadas
  COUNT(fp.id) FILTER (WHERE fp.status IN ('programado', 'aprovado')) AS ferias_programadas,
  MIN(fp.data_inicio) FILTER (WHERE fp.status IN ('programado', 'aprovado') AND fp.data_inicio >= CURRENT_DATE) AS proximas_ferias_inicio,

  -- Status geral
  CASE
    WHEN BOOL_OR(pa.esta_vencido) THEN 'critico' -- Férias vencidas
    WHEN MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo' AND pa.dias_saldo > 0) < CURRENT_DATE + INTERVAL '30 days' THEN 'alerta' -- Vence em < 30 dias
    WHEN MIN(pa.concessivo_fim) FILTER (WHERE pa.status = 'ativo' AND pa.dias_saldo > 0) < CURRENT_DATE + INTERVAL '60 days' THEN 'atencao' -- Vence em < 60 dias
    ELSE 'ok'
  END AS status_ferias

FROM public.colaboradores c
LEFT JOIN public.ferias_periodos_aquisitivos pa ON pa.colaborador_id = c.id
LEFT JOIN public.ferias_programacoes fp ON fp.colaborador_id = c.id
WHERE c.tipo = 'clt' AND c.status = 'active'
GROUP BY c.id, c.nome, c.nome_completo, c.foto_url, c.funcao, c.departamento, c.data_admissao, c.status, c.salario_base;

COMMENT ON VIEW public.v_ferias_colaboradores_status IS 'Status consolidado de férias por colaborador CLT ativo';

-- =====================================================
-- 3. FUNCTIONS SQL
-- =====================================================

-- Function: calcular_periodos_aquisitivos
-- Calcula e cria automaticamente períodos aquisitivos para colaboradores CLT
CREATE OR REPLACE FUNCTION public.calcular_periodos_aquisitivos(p_colaborador_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data_admissao DATE;
  v_tipo TEXT;
  v_status TEXT;
  v_periodo_inicio DATE;
  v_periodo_fim DATE;
  v_concessivo_inicio DATE;
  v_concessivo_fim DATE;
  v_count INTEGER := 0;
BEGIN
  -- Validar colaborador CLT ativo
  SELECT data_admissao, tipo, status INTO v_data_admissao, v_tipo, v_status
  FROM public.colaboradores
  WHERE id = p_colaborador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador % não encontrado', p_colaborador_id;
  END IF;

  IF v_tipo != 'clt' THEN
    RAISE EXCEPTION 'Colaborador % não é CLT (tipo: %)', p_colaborador_id, v_tipo;
  END IF;

  IF v_data_admissao IS NULL THEN
    RAISE EXCEPTION 'Colaborador % não tem data de admissão', p_colaborador_id;
  END IF;

  -- Criar períodos de 12 em 12 meses desde admissão até hoje
  v_periodo_inicio := v_data_admissao;

  WHILE v_periodo_inicio < CURRENT_DATE LOOP
    v_periodo_fim := v_periodo_inicio + INTERVAL '12 months' - INTERVAL '1 day';
    v_concessivo_inicio := v_periodo_fim + INTERVAL '1 day';
    v_concessivo_fim := v_concessivo_inicio + INTERVAL '12 months' - INTERVAL '1 day';

    -- Só criar se o período aquisitivo já completou (12 meses trabalhados)
    IF v_periodo_fim <= CURRENT_DATE THEN
      -- Inserir se não existir (idempotente)
      INSERT INTO public.ferias_periodos_aquisitivos (
        colaborador_id,
        data_inicio,
        data_fim,
        concessivo_inicio,
        concessivo_fim,
        status
      )
      VALUES (
        p_colaborador_id,
        v_periodo_inicio,
        v_periodo_fim,
        v_concessivo_inicio,
        v_concessivo_fim,
        CASE
          WHEN v_concessivo_fim < CURRENT_DATE THEN 'vencido'
          ELSE 'ativo'
        END
      )
      ON CONFLICT (colaborador_id, data_inicio) DO UPDATE
      SET
        status = CASE
          WHEN EXCLUDED.concessivo_fim < CURRENT_DATE AND ferias_periodos_aquisitivos.dias_saldo > 0 THEN 'vencido'
          WHEN ferias_periodos_aquisitivos.dias_saldo = 0 THEN 'concluido'
          ELSE 'ativo'
        END,
        updated_at = NOW();

      v_count := v_count + 1;
    END IF;

    v_periodo_inicio := v_periodo_inicio + INTERVAL '12 months';
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.calcular_periodos_aquisitivos IS 'Calcula períodos aquisitivos de férias para colaborador CLT';

-- Function: atualizar_status_periodos_ferias
-- Atualiza status de períodos e programações baseado em datas
CREATE OR REPLACE FUNCTION public.atualizar_status_periodos_ferias()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- Marcar como vencido os que passaram do período concessivo com saldo
  UPDATE public.ferias_periodos_aquisitivos
  SET status = 'vencido', updated_at = NOW()
  WHERE status NOT IN ('vencido', 'concluido')
    AND concessivo_fim < CURRENT_DATE
    AND dias_saldo > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Marcar como concluído os que têm saldo zero
  UPDATE public.ferias_periodos_aquisitivos
  SET status = 'concluido', updated_at = NOW()
  WHERE status NOT IN ('concluido', 'vencido')
    AND dias_saldo = 0;

  -- Atualizar status de programações para "em_gozo" (iniciou)
  UPDATE public.ferias_programacoes
  SET status = 'em_gozo', updated_at = NOW()
  WHERE status IN ('programado', 'aprovado')
    AND data_inicio <= CURRENT_DATE
    AND data_fim >= CURRENT_DATE;

  -- Atualizar status de programações para "concluido" (terminou)
  UPDATE public.ferias_programacoes
  SET status = 'concluido', updated_at = NOW()
  WHERE status = 'em_gozo'
    AND data_fim < CURRENT_DATE;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.atualizar_status_periodos_ferias IS 'Atualiza automaticamente status de períodos e programações';

-- Function: calcular_valor_ferias
-- Calcula valor de pagamento de férias (salário + 1/3 constitucional + abono se houver)
CREATE OR REPLACE FUNCTION public.calcular_valor_ferias(
  p_colaborador_id INTEGER,
  p_dias_uteis INTEGER,
  p_dias_abono INTEGER DEFAULT 0
)
RETURNS TABLE (
  salario_base NUMERIC(10,2),
  valor_ferias NUMERIC(10,2),
  valor_terco NUMERIC(10,2),
  valor_abono NUMERIC(10,2),
  valor_total NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_salario_base NUMERIC(10,2);
  v_valor_dia NUMERIC(10,2);
  v_valor_ferias NUMERIC(10,2);
  v_valor_terco NUMERIC(10,2);
  v_valor_abono NUMERIC(10,2);
BEGIN
  -- Buscar salário base do colaborador
  SELECT c.salario_base INTO v_salario_base
  FROM public.colaboradores c
  WHERE c.id = p_colaborador_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador % não encontrado', p_colaborador_id;
  END IF;

  -- Calcular valor por dia (salário / 30)
  v_valor_dia := v_salario_base / 30;

  -- Valor das férias (dias úteis * valor dia)
  v_valor_ferias := v_valor_dia * p_dias_uteis;

  -- 1/3 constitucional
  v_valor_terco := v_valor_ferias / 3;

  -- Abono pecuniário (venda de dias)
  v_valor_abono := CASE WHEN p_dias_abono > 0 THEN (v_valor_dia * p_dias_abono) + ((v_valor_dia * p_dias_abono) / 3) ELSE 0 END;

  RETURN QUERY
  SELECT
    v_salario_base,
    v_valor_ferias,
    v_valor_terco,
    v_valor_abono,
    v_valor_ferias + v_valor_terco + v_valor_abono;
END;
$$;

COMMENT ON FUNCTION public.calcular_valor_ferias IS 'Calcula valor de pagamento de férias (férias + 1/3 + abono)';

-- =====================================================
-- 4. EXTENSÃO DA TABELA notificacao_config
-- =====================================================

-- Adicionar colunas para configuração de alertas de férias
ALTER TABLE public.notificacao_config
  ADD COLUMN IF NOT EXISTS ferias_alerta_aquisitivo_prox BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ferias_alerta_aquisitivo_dias INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS ferias_alerta_concessivo_critico BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ferias_alerta_concessivo_dias INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS ferias_alerta_vencimento_multa BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ferias_alerta_pagamento_pendente BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ferias_alerta_inicio_ferias BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ferias_alerta_inicio_dias INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS ferias_resumo_mensal_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ferias_resumo_mensal_dia INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ferias_resumo_mensal_hora TIME WITHOUT TIME ZONE NOT NULL DEFAULT '08:00';

COMMENT ON COLUMN public.notificacao_config.ferias_alerta_aquisitivo_prox IS 'Alertar quando período aquisitivo próximo de completar';
COMMENT ON COLUMN public.notificacao_config.ferias_alerta_concessivo_critico IS 'Alertar quando período concessivo próximo de vencer';
COMMENT ON COLUMN public.notificacao_config.ferias_alerta_vencimento_multa IS 'Alertar férias vencidas (CRÍTICO - multa em dobro)';
COMMENT ON COLUMN public.notificacao_config.ferias_resumo_mensal_ativo IS 'Enviar resumo mensal de situação de férias';

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.ferias_periodos_aquisitivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferias_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferias_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ferias_historico_acoes ENABLE ROW LEVEL SECURITY;

-- Policies para ferias_periodos_aquisitivos
CREATE POLICY "Usuários autenticados podem visualizar períodos aquisitivos"
  ON public.ferias_periodos_aquisitivos
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem inserir períodos aquisitivos"
  ON public.ferias_periodos_aquisitivos
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem atualizar períodos aquisitivos"
  ON public.ferias_periodos_aquisitivos
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem deletar períodos aquisitivos"
  ON public.ferias_periodos_aquisitivos
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Policies para ferias_programacoes
CREATE POLICY "Usuários autenticados podem visualizar programações"
  ON public.ferias_programacoes
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem inserir programações"
  ON public.ferias_programacoes
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem atualizar programações"
  ON public.ferias_programacoes
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem deletar programações"
  ON public.ferias_programacoes
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Policies para ferias_ai_insights
CREATE POLICY "Usuários autenticados podem visualizar insights"
  ON public.ferias_ai_insights
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem inserir insights"
  ON public.ferias_ai_insights
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policies para ferias_historico_acoes
CREATE POLICY "Usuários autenticados podem visualizar histórico"
  ON public.ferias_historico_acoes
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem inserir no histórico"
  ON public.ferias_historico_acoes
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- 6. GRANTS
-- =====================================================

-- Grant de permissões para authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias_periodos_aquisitivos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias_programacoes TO authenticated;
GRANT SELECT, INSERT ON public.ferias_ai_insights TO authenticated;
GRANT SELECT, INSERT ON public.ferias_historico_acoes TO authenticated;

-- Grant de execução das functions
GRANT EXECUTE ON FUNCTION public.calcular_periodos_aquisitivos TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_periodos_ferias TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_valor_ferias TO authenticated;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
