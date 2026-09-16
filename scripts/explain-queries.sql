\echo '=== Auth CPF ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, ativo FROM clientes WHERE cpf_cnpj = '00000000500' AND LENGTH(cpf_cnpj) = 11;

\echo '=== Fila OS (status abertos) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM ordens_servico
WHERE status NOT IN ('FINALIZADA', 'ENTREGUE')
ORDER BY status DESC, criado_em ASC
LIMIT 20;

\echo '=== Orçamento pendente ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM orcamentos
WHERE ordem_servico_id = (SELECT id FROM ordens_servico LIMIT 1)
  AND status = 'AGUARDANDO_APROVACAO'
LIMIT 1;

\echo '=== Movimentações por peça ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM movimentacoes_estoque
WHERE peca_id = (SELECT id FROM pecas LIMIT 1)
ORDER BY criado_em DESC
LIMIT 20;

\echo '=== Volume diário ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM ordens_servico
WHERE criado_em >= NOW() - INTERVAL '1 day';
