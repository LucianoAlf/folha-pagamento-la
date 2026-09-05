alter table public.maria_gov_findings
  add column if not exists veredito_humano text,
  add column if not exists julgado_por     text,
  add column if not exists julgado_em      timestamptz,
  add column if not exists julgado_nota    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maria_gov_findings_veredito_humano_check') then
    alter table public.maria_gov_findings
      add constraint maria_gov_findings_veredito_humano_check
      check (veredito_humano is null or veredito_humano in ('verdadeiro','falso','parcial'));
  end if;
end $$;

comment on column public.maria_gov_findings.veredito_humano is
  'Julgamento humano do achado: verdadeiro | falso | parcial. Null = ninguem julgou ainda (nao e o mesmo que verdadeiro).';

create or replace function public.maria_gov_finding_julgar(
  p_finding_id uuid,
  p_veredito   text,
  p_por        text,
  p_nota       text default null
) returns table (id uuid, resumo text, veredito_humano text, julgado_por text, julgado_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_veredito is null or p_veredito not in ('verdadeiro','falso','parcial') then
    raise exception 'veredito precisa ser verdadeiro, falso ou parcial (recebido: %)', coalesce(p_veredito,'null');
  end if;
  if coalesce(btrim(p_por),'') = '' then
    raise exception 'julgado_por e obrigatorio: julgamento sem autor nao vale como prova';
  end if;

  return query
  update public.maria_gov_findings f
     set veredito_humano = p_veredito,
         julgado_por     = btrim(p_por),
         julgado_em      = now(),
         julgado_nota    = nullif(btrim(coalesce(p_nota,'')), ''),
         status          = case when p_veredito = 'falso' then 'fechado' else f.status end
   where f.id = p_finding_id
  returning f.id, f.resumo, f.veredito_humano, f.julgado_por, f.julgado_em;

  if not found then
    raise exception 'achado % nao encontrado', p_finding_id;
  end if;
end $$;

revoke all on function public.maria_gov_finding_julgar(uuid, text, text, text) from public;
grant execute on function public.maria_gov_finding_julgar(uuid, text, text, text) to maria_operacional;

create or replace view public.vw_maria_gov_precisao as
select count(*)                                                        as achados,
       count(veredito_humano)                                          as julgados,
       count(*) filter (where veredito_humano = 'verdadeiro')          as verdadeiros,
       count(*) filter (where veredito_humano = 'falso')               as falsos,
       count(*) filter (where veredito_humano = 'parcial')             as parciais,
       count(*) - count(veredito_humano)                               as sem_julgamento,
       case when count(veredito_humano) = 0 then null
            else round(100.0 * count(*) filter (where veredito_humano = 'falso')
                       / count(veredito_humano), 1) end                as pct_falso_entre_julgados
  from public.maria_gov_findings;

revoke all on public.vw_maria_gov_precisao from public, anon, authenticated;
grant select on public.vw_maria_gov_precisao to maria_operacional, maria_leitura;
