-- Reconcilia as colunas publicadas antes de o fluxo entrar no repositório
-- e adiciona versionamento não destrutivo do roteiro de entrevista.
alter table public.rh_candidatos
  add column if not exists ficha_token text,
  add column if not exists la_colaborador_id integer,
  add column if not exists ficha_importada_em timestamptz,
  add column if not exists perguntas_entrevista jsonb,
  add column if not exists perguntas_geradas_em timestamptz,
  add column if not exists ficha_snapshot_hash text,
  add column if not exists perguntas_desatualizadas boolean not null default false;

comment on column public.rh_candidatos.ficha_snapshot_hash is
  'SHA-256 do snapshot canônico recebido do LA Report.';
comment on column public.rh_candidatos.perguntas_desatualizadas is
  'Roteiro preservado, mas gerado antes da última mudança da Ficha Técnica.';
