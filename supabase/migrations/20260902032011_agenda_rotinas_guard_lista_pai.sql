-- Agenda fase B1 — correcao R-B1-4 da revisao da Task 1.
-- A guarda anterior retornava cedo para toda linha sem pai (`parent_rotina_id is null`),
-- entao um `update agenda_rotinas set lista_id = X where id = <pai com filhas>` passava
-- sem reconferir as filhas e quebrava, em silencio, o invariante "filha na mesma lista do pai".
-- Decisao (spec: "lista da rotina nao e editavel: encerre e crie outra"): pai com filhas nao
-- muda de lista. A guarda do banco e a unica barreira — as RPCs de rotina serao de outro time.
create or replace function public.agenda_rotinas_guard_parent()
returns trigger language plpgsql set search_path = public as $$
declare v_pai public.agenda_rotinas%rowtype;
begin
  -- Vale pro pai (parent_rotina_id null) e pra filha: quem tem filhas esta preso a sua lista.
  if tg_op = 'UPDATE' and new.lista_id is distinct from old.lista_id
     and exists (select 1 from public.agenda_rotinas f where f.parent_rotina_id = new.id) then
    raise exception 'rotina com filhas nao muda de lista: encerre e crie outra.' using errcode = 'P0001';
  end if;
  if new.parent_rotina_id is null then return new; end if;
  if new.parent_rotina_id = new.id then
    raise exception 'rotina nao pode ser pai de si mesma.' using errcode = 'P0001';
  end if;
  select * into v_pai from public.agenda_rotinas where id = new.parent_rotina_id;
  if not found then
    raise exception 'rotina pai nao encontrada.' using errcode = 'P0001';
  end if;
  if v_pai.parent_rotina_id is not null then
    raise exception 'profundidade maxima 1: filha nao pode ter filha.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.agenda_rotinas f where f.parent_rotina_id = new.id) then
    raise exception 'profundidade maxima 1: rotina com filhas nao pode virar filha.' using errcode = 'P0001';
  end if;
  if v_pai.lista_id <> new.lista_id then
    raise exception 'filha deve estar na mesma lista do pai.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Reemitido para o arquivo ficar autocontido; a definicao e a mesma da migration de schema.
drop trigger if exists agenda_rotinas_guard_parent on public.agenda_rotinas;
create trigger agenda_rotinas_guard_parent before insert or update of parent_rotina_id, lista_id on public.agenda_rotinas
  for each row execute function public.agenda_rotinas_guard_parent();
