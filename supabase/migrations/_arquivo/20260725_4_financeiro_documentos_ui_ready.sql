-- Super Folha — financeiro_documentos pronto para UI de comprovantes
-- Fase 2 backend: policy storage, view de listagem e unique hash parcial.

begin;

-- Bucket privado continua privado. Usuários autenticados do Super Folha podem pedir signed URL
-- via supabase-js, coerente com a policy atual de metadados em public.financeiro_documentos.
drop policy if exists financeiro_documentos_storage_select_authenticated on storage.objects;
create policy financeiro_documentos_storage_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'financeiro-documentos');

-- Fecha caminho de INSERT direto duplicando comprovante ativo/não rejeitado.
-- Rejeitados podem preservar o hash histórico e permitir novo anexo correto.
create unique index if not exists financeiro_documentos_hash_ativo_uidx
  on public.financeiro_documentos (hash)
  where hash is not null
    and status_documento <> 'rejeitado';

-- View de apoio para tela de histórico por conta.
-- Observação: storage_path é necessário para createSignedUrl no frontend; não deve ser exibido na UI.
create or replace view public.vw_financeiro_documentos_conta_pagar
with (security_invoker = true)
as
select
  d.id as documento_id,
  d.vinculo_id as conta_pagar_id,
  c.descricao as conta_descricao,
  c.unidade,
  c.valor as conta_valor,
  c.data_vencimento,
  c.competencia,
  d.tipo,
  d.origem,
  d.status_documento,
  d.nome_arquivo,
  d.mime_type,
  d.tamanho_bytes,
  d.created_at,
  d.rejeitado_em,
  d.rejeitado_por,
  d.rejeitado_motivo,
  case
    when d.hash is null then null
    when length(d.hash) <= 12 then d.hash
    else left(d.hash, 12) || '…'
  end as hash_parcial,
  d.storage_ref as storage_path,
  d.metadata->>'mensagem_origem_id' as mensagem_origem_id,
  d.metadata->>'canal_origem' as canal_origem,
  d.metadata->>'chat_id' as chat_id,
  d.metadata->>'enviado_por' as enviado_por,
  d.metadata->>'confirmado_por' as confirmado_por,
  coalesce((d.metadata->>'pagamento_executado_pela_maria')::boolean, false) as pagamento_executado_pela_maria
from public.financeiro_documentos d
left join public.contas_pagar c
  on c.id = d.vinculo_id
where d.vinculo_tipo = 'conta_pagar';

revoke all on public.vw_financeiro_documentos_conta_pagar from public, anon, authenticated, service_role;
grant select on public.vw_financeiro_documentos_conta_pagar to authenticated, service_role;

comment on view public.vw_financeiro_documentos_conta_pagar is
  'Listagem sanitizada de comprovantes financeiros vinculados a contas_pagar. storage_path é para createSignedUrl, não para exibição.';

commit;
