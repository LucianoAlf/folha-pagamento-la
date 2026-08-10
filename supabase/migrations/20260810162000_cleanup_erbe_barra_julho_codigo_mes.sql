update public.contas_pagar_codigo_mes
set codigo_barras = '23792.37205 90002.400373 60002.788200 4 14980000306181',
    observacao_operacional = concat_ws(
      E'\n',
      nullif(trim(observacao_operacional), ''),
      'Correção técnica 2026-08-10: campo codigo_barras continha dois boletos ERBE Barra colados com rótulos. Mantido apenas o boleto Luciano nesta conta. Boleto Anne preservado nesta observação: 23792.37205 90002.400373 61002.788208 1 14980000306182.'
    ),
    updated_at = now()
where id = '5f732b92-19a9-47b3-99a7-6508405c2b6d'
  and conta_pagar_id = '4db5d51c-0c74-45ff-a0cf-87e9b421efe0'
  and competencia = '2026-07-01'
  and codigo_barras = E'23792.37205 90002.400373 61002.788208 1 14980000306182 - Anne R$3.061,82\n23792.37205 90002.400373 60002.788200 4 14980000306181 - Luciano R$3.061,81';
