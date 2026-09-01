-- Corrige o horizonte de agenda_lembretes_devidos (Task 3, achado #1 da revisao).
--
-- Contrato: `p_ate` e horizonte de **momento**: a funcao alarga pelo offset efetivo da linha;
-- o job filtra por `momento`.
--
-- Antes o filtro era `t.vencimento_em <= p_ate`, o que so funciona enquanto o offset for pequeno.
-- `notificacao_config.lembrete_padrao_minutos` e configuravel pelo usuario e sem teto (as colunas
-- irmas de RH ja usam 1440 por padrao): com offset de 1440, o `momento` cai 24 h antes do
-- vencimento e o ping ficaria invisivel pra um job chamando `p_ate = now() + 2h` — sem erro,
-- sem log, notificacao silenciosamente perdida. Agora o candidato entra se o **momento** cabe
-- no horizonte, alargando o corte pelo offset efetivo daquela linha.
--
-- Assinatura e select list identicos a migration 20260901214314; muda so o predicado de horizonte.
-- O lookback de 12 h continua igual (cobre o adiamento da janela de silencio).
create or replace function public.agenda_lembretes_devidos(p_ate timestamptz)
returns table (
  tarefa_id uuid, titulo text, descricao text, prioridade text, categoria text,
  vencimento_em timestamptz, momento timestamptz,
  user_id uuid, nome text,
  whatsapp_numero text, whatsapp_ativo boolean, agenda_lembrete_tarefas_ativo boolean
)
language sql stable security definer set search_path = public as $$
  select t.id, t.titulo, t.descricao, t.prioridade, t.categoria, t.vencimento_em,
         public.agenda_momento_lembrete(
           t.vencimento_em, t.dia_inteiro,
           coalesce(t.lembrete_minutos[1], nc.lembrete_padrao_minutos, 30)
         ) as momento,
         d.user_id, d.nome,
         nc.whatsapp_numero, coalesce(nc.whatsapp_ativo, false), coalesce(nc.agenda_lembrete_tarefas_ativo, true)
    from public.tarefas t
    cross join lateral public.agenda_destinatarios(t.id) d
    left join public.notificacao_config nc on nc.user_id = d.user_id
   where t.vencimento_em is not null
     and coalesce(t.dia_inteiro, false) = false
     and t.status in ('pendente', 'em_andamento')
     and t.vencimento_em <= p_ate + coalesce(t.lembrete_minutos[1], nc.lembrete_padrao_minutos, 30) * interval '1 minute'
     and t.vencimento_em >= now() - interval '12 hours'
   order by t.vencimento_em, d.nome;
$$;

-- create or replace preserva a ACL, mas reafirmamos aqui pro arquivo ser autossuficiente.
revoke all on function public.agenda_lembretes_devidos(timestamptz) from public, anon, authenticated;
grant execute on function public.agenda_lembretes_devidos(timestamptz) to service_role;
