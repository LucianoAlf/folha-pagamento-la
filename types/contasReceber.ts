export type ContaReceberStatus = 'recebido' | 'pendente' | 'cancelado' | 'revisar';
export type ContaReceberClassificacaoStatus = 'confirmada' | 'pendente' | 'excluida';
export type ContaReceberMatchStatus = 'unico' | 'nao_encontrado' | 'duplicado';

export interface ContaReceber {
  id: string;
  la_report_fatura_id: string;
  la_report_unidade_id: string;
  emusys_fatura_id: string | number;
  emusys_matricula_id: string | number | null;
  emusys_student_id: string | number | null;
  unidade: 'cg' | 'rec' | 'bar';
  descricao: string;
  aluno_nome: string | null;
  curso_nome: string | null;
  cadastro_match_status: ContaReceberMatchStatus;
  curso_candidatos: Array<{
    aluno_id: number;
    aluno_nome: string;
    curso_id: number | null;
    curso_nome: string | null;
  }>;
  status_origem: string;
  status: ContaReceberStatus;
  competencia: string;
  data_vencimento: string | null;
  data_recebimento: string | null;
  valor_original: number;
  valor_pago: number | null;
  juros_e_multa: number;
  desconto_aplicado: number;
  desconto_fixo: number;
  desconto_condicional: number;
  valor_liquido: number;
  plano_conta_id: string | null;
  centro_custo_id: string | null;
  excluido_da_receita: boolean;
  motivo_exclusao: string | null;
  classificacao_status: ContaReceberClassificacaoStatus;
  classificacao_origem: 'automatica' | 'manual' | 'pendente' | 'exclusao_automatica';
  classificado_por: string | null;
  classificado_em: string | null;
  row_source_hash: string;
  manifest_hash: string;
  source_missing: boolean;
  source_missing_reason: string | null;
  source_missing_detected_at: string | null;
  source_missing_resolved_at: string | null;
  source_last_seen_at: string | null;
  source_sync_run_id: string | null;
  source_sync_run_item_id: string | null;
  source_updated_at: string | null;
  source_synced_at: string | null;
  imported_at: string;
  plano_conta?: { id: string; codigo: string; nome: string } | null;
  centro_custo?: { id: string; codigo: string; nome: string } | null;
}

export interface ContaReceberFilters {
  unidade: 'all' | 'cg' | 'rec' | 'bar';
  status: 'all' | ContaReceberStatus;
  classificacao: 'all' | ContaReceberClassificacaoStatus;
  busca: string;
}

export interface ContasReceberManifesto {
  competencia: string;
  sync_run_id: string;
  latest_complete_sync_run_id?: string;
  sync_completed_at?: string | null;
  snapshot_complete: boolean;
  manifest_hash: string;
  total_linhas: number;
  total_valor_liquido: number;
  total_valor_pago: number;
  cadastro_matches: {
    unico: number;
    nao_encontrado: number;
    duplicado: number;
  };
  source_updated_at?: string | null;
  source_synced_at?: string | null;
}

export interface ContasReceberPreflight {
  success: true;
  action: 'preflight';
  preflight_id: string | null;
  apply_allowed: boolean;
  refresh_ok: boolean;
  refresh_error: string | null;
  manifesto: ContasReceberManifesto;
  resumo: {
    recebido: number;
    em_aberto: number;
    em_revisao: number;
    excluido_rateio: number;
    cancelado: number;
  };
  classificacao: {
    mensalidades: number;
    matriculas_passaportes: number;
    locacoes: number;
    vendas_avulsas: number;
    receitas_operacionais: number;
    rateios_excluidos: number;
    pendentes_manuais: number;
  };
}

export interface PlanoContaEntrada {
  id: string;
  codigo: string;
  nome: string;
}
