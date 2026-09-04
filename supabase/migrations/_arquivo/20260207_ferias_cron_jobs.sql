-- =====================================================
-- CRON JOBS - SISTEMA DE FÉRIAS CLT
-- Data: 2026-02-07
-- Descrição: Jobs automáticos para manutenção do sistema
-- =====================================================

-- Verificar se pg_cron está habilitado
SELECT cron.schedule(
  'ferias-atualizar-status-diario',
  '0 1 * * *', -- Diariamente à 01:00 AM
  $$
  SELECT public.atualizar_status_periodos_ferias();
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Jobs automáticos para atualização de status de férias';

-- =====================================================
-- FUNÇÃO: Buscar férias vencidas por usuário
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_ferias_vencidas(p_user_id UUID)
RETURNS TABLE (
  colaborador_id INT,
  nome TEXT,
  dias_saldo INT,
  concessivo_fim DATE,
  dias_vencidos INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pa.colaborador_id,
    c.nome,
    pa.dias_saldo,
    pa.concessivo_fim,
    GREATEST(0, CURRENT_DATE - pa.concessivo_fim)::INT as dias_vencidos
  FROM ferias_periodos_aquisitivos pa
  JOIN colaboradores c ON c.id = pa.colaborador_id
  WHERE pa.esta_vencido = true
    AND pa.dias_saldo > 0
  ORDER BY pa.concessivo_fim ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_ferias_vencidas IS 'Retorna períodos de férias vencidos por usuário';

-- =====================================================
-- CRON JOB: Alertas WhatsApp de Férias (a cada 5 minutos)
-- =====================================================
SELECT cron.schedule(
  'ferias-whatsapp-alertas',
  '*/5 * * * *', -- A cada 5 minutos
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/whatsapp-ferias-alertas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Jobs automáticos: atualização de status (diário) e alertas WhatsApp (5 min)';
