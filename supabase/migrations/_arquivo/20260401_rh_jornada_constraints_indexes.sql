-- Status ativos oficiais para suportar índices parciais:
-- recrutamento ativo: rascunho, em_andamento, aguardando_documentos, aguardando_avaliacao, aguardando_aprovacao
-- onboarding ativo: rascunho, em_andamento, aguardando_documentos, aguardando_avaliacao, aguardando_aprovacao
-- desligamento ativo: rascunho, em_andamento, aguardando_documentos, aguardando_avaliacao, aguardando_aprovacao

create unique index if not exists uq_rh_processo_participantes_unique_role
  on public.rh_processo_participantes (processo_id, user_id, papel);

create unique index if not exists uq_rh_etapa_responsaveis_unique_role
  on public.rh_etapa_responsaveis (etapa_id, user_id, papel);

create unique index if not exists uq_rh_template_etapas_ordem
  on public.rh_template_etapas (template_id, ordem);

create unique index if not exists uq_rh_template_etapas_codigo
  on public.rh_template_etapas (template_id, codigo);

create unique index if not exists uq_rh_template_checklist_ordem
  on public.rh_template_checklist_itens (template_etapa_id, ordem);

create unique index if not exists uq_rh_checklist_ordem
  on public.rh_checklist_itens (etapa_id, ordem);

create unique index if not exists uq_rh_template_documentos_ordem
  on public.rh_template_documentos (template_id, ordem);

create unique index if not exists uq_rh_processos_onboarding_ativo_por_colaborador
  on public.rh_processos (colaborador_id)
  where tipo = 'onboarding'
    and colaborador_id is not null
    and arquivado_em is null
    and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao');

create unique index if not exists uq_rh_processos_desligamento_ativo_por_colaborador
  on public.rh_processos (colaborador_id)
  where tipo = 'desligamento'
    and colaborador_id is not null
    and arquivado_em is null
    and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao');

create unique index if not exists uq_rh_processos_recrutamento_ativo_por_candidato
  on public.rh_processos (candidato_id)
  where tipo = 'recrutamento'
    and candidato_id is not null
    and arquivado_em is null
    and status in ('rascunho', 'em_andamento', 'aguardando_documentos', 'aguardando_avaliacao', 'aguardando_aprovacao');

create index if not exists idx_rh_candidatos_status
  on public.rh_candidatos (status);

create index if not exists idx_rh_processos_status
  on public.rh_processos (status);

create index if not exists idx_rh_processos_tipo
  on public.rh_processos (tipo);

create index if not exists idx_rh_processos_owner
  on public.rh_processos (owner_user_id);

create index if not exists idx_rh_processos_mentor
  on public.rh_processos (mentor_user_id);

create index if not exists idx_rh_processos_colaborador
  on public.rh_processos (colaborador_id);

create index if not exists idx_rh_processos_candidato
  on public.rh_processos (candidato_id);

create index if not exists idx_rh_processos_inicio_fim
  on public.rh_processos (data_inicio, data_fim_prevista);

create index if not exists idx_rh_processo_etapas_status
  on public.rh_processo_etapas (status);

create index if not exists idx_rh_processo_etapas_limite
  on public.rh_processo_etapas (data_limite);

create index if not exists idx_rh_processo_etapas_processo_ordem
  on public.rh_processo_etapas (processo_id, ordem);

create index if not exists idx_rh_documentos_status
  on public.rh_documentos (status);

create index if not exists idx_rh_documentos_tipo
  on public.rh_documentos (tipo_documento);

create index if not exists idx_rh_documentos_processo
  on public.rh_documentos (processo_id);

create index if not exists idx_rh_avaliacoes_tipo
  on public.rh_avaliacoes (tipo);

create index if not exists idx_rh_avaliacoes_processo
  on public.rh_avaliacoes (processo_id);

create index if not exists idx_rh_historico_eventos_processo_created
  on public.rh_historico_eventos (processo_id, created_at desc);

create index if not exists idx_rh_comentarios_processo_created
  on public.rh_processo_comentarios (processo_id, created_at desc);

create index if not exists idx_rh_regras_alerta_lookup
  on public.rh_regras_alerta (tipo_processo, tipo_etapa, ativo);
