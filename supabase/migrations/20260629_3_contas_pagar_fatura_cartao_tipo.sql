-- Fase 2: adiciona o instrumento de pagamento de fatura de cartao em contas_pagar.
-- Nao altera a semantica das linhas existentes; apenas amplia o CHECK.

alter table public.contas_pagar
  drop constraint if exists contas_pagar_tipo_lancamento_check;

alter table public.contas_pagar
  add constraint contas_pagar_tipo_lancamento_check
  check (tipo_lancamento in ('unica','recorrente','parcelada','eventual','fatura_cartao'));

alter table public.contas_pagar
  drop constraint if exists contas_pagar_fonte_tipo_check;

alter table public.contas_pagar
  add constraint contas_pagar_fonte_tipo_check
  check (fonte_tipo is null or fonte_tipo in (
    'site', 'email', 'pix_fixo', 'banco', 'whatsapp', 'manual', 'cartao'
  ));
