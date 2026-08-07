-- Fixture exclusivamente reversível para o E2E de memória de variações.
-- O executor só usa este arquivo para cleanup após registrar os IDs criados.
delete from public.contas_pagar
where descricao like 'TEST_CONTAS_MEMORIA_20260806%';
