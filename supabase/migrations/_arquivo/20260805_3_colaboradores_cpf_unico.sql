-- Executar somente depois do readback bem-sucedido da reconciliacao produtiva.

do $$
begin
  if exists (
    select 1
    from public.colaboradores c
    where public.rh_cpf_normalizar(c.cpf) is not null
    group by public.rh_cpf_normalizar(c.cpf)
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Ainda existem colaboradores com CPF normalizado duplicado.';
  end if;
end;
$$;

create unique index if not exists colaboradores_cpf_normalizado_uidx
  on public.colaboradores ((public.rh_cpf_normalizar(cpf)))
  where public.rh_cpf_normalizar(cpf) is not null;

comment on index public.colaboradores_cpf_normalizado_uidx
  is 'Impede colaboradores duplicados pelo mesmo CPF, independentemente de pontuacao.';
