with base_templates as (
  insert into public.rh_templates (
    tipo_processo,
    nome,
    descricao,
    ativo,
    escopo_contrato,
    versao
  )
  values
    ('recrutamento', 'Recrutamento Padrão', 'Fluxo padrão para triagem, entrevista e aula teste.', true, null, 1),
    ('onboarding', 'Onboarding Padrão', 'Template inicial baseado na estrutura validada pela Ana.', true, null, 1),
    ('desligamento', 'Desligamento Padrão', 'Template inicial para saídas e documentação obrigatória.', true, null, 1)
  on conflict do nothing
  returning id, nome
),
all_templates as (
  select id, nome from base_templates
  union all
  select id, nome from public.rh_templates where nome in ('Recrutamento Padrão', 'Onboarding Padrão', 'Desligamento Padrão')
)
insert into public.rh_template_etapas (
  template_id,
  codigo,
  titulo,
  categoria,
  ordem,
  obrigatoria,
  prazo_offset_dias,
  responsavel_padrao_papel
)
select t.id, x.codigo, x.titulo, x.categoria, x.ordem, true, x.prazo_offset_dias, x.responsavel
from all_templates t
join (
  values
    ('Recrutamento Padrão', 'questionario', 'Questionário inicial', 'entrevista', 1, 0, 'rh'),
    ('Recrutamento Padrão', 'entrevista', 'Entrevista RH', 'entrevista', 2, 2, 'rh'),
    ('Recrutamento Padrão', 'aula_teste', 'Aula teste com professor experiente', 'aula_teste', 3, 5, 'avaliador'),
    ('Recrutamento Padrão', 'decisao', 'Decisão final do recrutamento', 'encerramento', 4, 7, 'rh'),

    ('Onboarding Padrão', 'entrevista', 'Entrevista', 'entrevista', 1, 0, 'rh'),
    ('Onboarding Padrão', 'boas_vindas_apresentacoes', 'Boas-vindas e apresentações', 'cultura', 2, 1, 'rh'),
    ('Onboarding Padrão', 'mensagem_boas_vindas_mentor', 'Mensagem de boas-vindas do mentor', 'cultura', 3, 1, 'mentor'),
    ('Onboarding Padrão', 'documentacoes_formalidades_administrativas', 'Documentações e formalidades administrativas', 'documentacao', 4, 2, 'rh'),
    ('Onboarding Padrão', 'cultura_organizacional', 'Cultura organizacional', 'cultura', 5, 5, 'gestor'),
    ('Onboarding Padrão', 'configuracao_ferramentas_acessos', 'Configuração de ferramentas e acessos', 'acessos', 6, 3, 'mentor'),
    ('Onboarding Padrão', 'treinamento_funcional', 'Treinamento funcional', 'treinamento', 7, 5, 'mentor'),
    ('Onboarding Padrão', 'treinamentos_especificos', 'Treinamentos específicos', 'treinamento', 8, 7, 'mentor'),
    ('Onboarding Padrão', 'revisao_desempenho', 'Revisão de desempenho', 'feedback', 9, 30, 'gestor'),
    ('Onboarding Padrão', 'metas_planejamentos', 'Metas e planejamentos', 'feedback', 10, 45, 'gestor'),
    ('Onboarding Padrão', 'celebracao_integracao', 'Celebração da integração', 'encerramento', 11, 90, 'gestor'),

    ('Desligamento Padrão', 'abertura_desligamento', 'Abertura do desligamento', 'saida', 1, 0, 'rh'),
    ('Desligamento Padrão', 'motivo_saida', 'Motivo da saída', 'saida', 2, 0, 'rh'),
    ('Desligamento Padrão', 'aviso_previo', 'Aviso prévio', 'documento_oficial', 3, 1, 'rh'),
    ('Desligamento Padrão', 'documento_aviso_previo', 'Documento de aviso prévio', 'documento_oficial', 4, 1, 'rh'),
    ('Desligamento Padrão', 'bloqueio_acessos', 'Bloqueio de acessos e sistemas', 'acessos', 5, 1, 'gestor'),
    ('Desligamento Padrão', 'devolucao_materiais', 'Devolução de materiais', 'saida', 6, 3, 'gestor'),
    ('Desligamento Padrão', 'checklist_documental', 'Checklist documental', 'documentacao', 7, 2, 'rh'),
    ('Desligamento Padrão', 'rescisao', 'Rescisão', 'financeiro', 8, 4, 'financeiro'),
    ('Desligamento Padrão', 'alinhamento_financeiro', 'Alinhamento financeiro', 'financeiro', 9, 4, 'financeiro'),
    ('Desligamento Padrão', 'entrevista_saida', 'Entrevista de desligamento', 'saida', 10, 5, 'rh'),
    ('Desligamento Padrão', 'encerramento', 'Encerramento', 'encerramento', 11, 5, 'rh')
) as x(template_name, codigo, titulo, categoria, ordem, prazo_offset_dias, responsavel)
  on x.template_name = t.nome
where not exists (
  select 1
  from public.rh_template_etapas e
  where e.template_id = t.id
    and e.codigo = x.codigo
);

with docs_templates as (
  select id, nome from public.rh_templates where nome in ('Onboarding Padrão', 'Desligamento Padrão')
)
insert into public.rh_template_documentos (
  template_id,
  tipo_documento,
  obrigatorio,
  ordem
)
select t.id, d.tipo_documento, true, d.ordem
from docs_templates t
join (
  values
    ('Onboarding Padrão', 'rg', 1),
    ('Onboarding Padrão', 'cpf', 2),
    ('Onboarding Padrão', 'comprovante_residencia', 3),
    ('Onboarding Padrão', 'exame_admissional', 4),
    ('Onboarding Padrão', 'codigo_conduta', 5),
    ('Onboarding Padrão', 'la_culture', 6),
    ('Desligamento Padrão', 'aviso_previo', 1),
    ('Desligamento Padrão', 'checklist_documental', 2),
    ('Desligamento Padrão', 'documentos_rescisorios', 3)
) as d(template_name, tipo_documento, ordem)
  on d.template_name = t.nome
where not exists (
  select 1
  from public.rh_template_documentos td
  where td.template_id = t.id
    and td.tipo_documento = d.tipo_documento
);

insert into public.rh_regras_alerta (
  tipo_processo,
  tipo_etapa,
  dias_antes,
  canal,
  ativo
)
select *
from (
  values
    ('onboarding', 'feedback', 5, 'sistema', true),
    ('onboarding', 'feedback', 5, 'agenda', true),
    ('desligamento', 'documento_oficial', 1, 'sistema', true),
    ('desligamento', 'financeiro', 2, 'agenda', true),
    ('recrutamento', 'entrevista', 1, 'agenda', true)
) as x(tipo_processo, tipo_etapa, dias_antes, canal, ativo)
where not exists (
  select 1
  from public.rh_regras_alerta a
  where a.tipo_processo = x.tipo_processo
    and coalesce(a.tipo_etapa, '') = coalesce(x.tipo_etapa, '')
    and a.dias_antes = x.dias_antes
    and a.canal = x.canal
);
