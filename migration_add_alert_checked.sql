-- Migration: Adicionar coluna alert_checked na tabela lancamentos_folha
-- Execute este script no SQL Editor do Supabase Dashboard

ALTER TABLE lancamentos_folha 
ADD COLUMN IF NOT EXISTS alert_checked BOOLEAN DEFAULT FALSE;

-- Criar índice para melhorar performance nas consultas de alertas não verificados
CREATE INDEX IF NOT EXISTS idx_lancamentos_alert_checked 
ON lancamentos_folha(alert_checked) 
WHERE alert_checked = FALSE;

-- Comentário na coluna para documentação
COMMENT ON COLUMN lancamentos_folha.alert_checked IS 'Indica se o alerta de variação foi verificado e aprovado pelo RH';
