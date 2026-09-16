-- Seed mínimo para EXPLAIN ANALYZE. Idempotente via TRUNCATE CASCADE.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

TRUNCATE TABLE movimentacoes_estoque, historico_status_os, orcamentos,
  ordens_servico_pecas, ordens_servico_servicos, ordens_servico,
  veiculos, clientes, pecas, servicos RESTART IDENTITY CASCADE;

INSERT INTO servicos (id, nome, preco_base, tempo_estimado_min, ativo, criado_em, atualizado_em)
SELECT gen_random_uuid(), 'Servico ' || g, 100 + g, 60, true, NOW(), NOW()
FROM generate_series(1, 20) g;

INSERT INTO pecas (id, codigo, nome, preco_unitario, quantidade_estoque, estoque_minimo, ativo, criado_em, atualizado_em)
SELECT gen_random_uuid(), 'P' || lpad(g::text, 4, '0'), 'Peca ' || g, 50 + g, 100, 5, true, NOW(), NOW()
FROM generate_series(1, 50) g;

INSERT INTO clientes (id, nome, cpf_cnpj, email, telefone, ativo, criado_em, atualizado_em)
SELECT gen_random_uuid(),
       'Cliente ' || g,
       lpad(g::text, 11, '0'),
       'cliente' || g || '@example.com',
       '1199999' || lpad(g::text, 4, '0'),
       true,
       NOW() - (g || ' hours')::interval,
       NOW()
FROM generate_series(1, 1000) g;

INSERT INTO veiculos (id, placa, marca, modelo, ano, cliente_id, criado_em, atualizado_em)
SELECT gen_random_uuid(),
       'ABC' || lpad(g::text, 4, '0'),
       'Marca',
       'Modelo',
       2020,
       c.id,
       NOW(),
       NOW()
FROM generate_series(1, 1000) g
JOIN LATERAL (
  SELECT id FROM clientes ORDER BY random() LIMIT 1
) c ON true;

INSERT INTO ordens_servico (id, status, cliente_id, veiculo_id, criado_em, atualizado_em)
SELECT gen_random_uuid(),
       (ARRAY['RECEBIDA','EM_DIAGNOSTICO','AGUARDANDO_APROVACAO','EM_EXECUCAO','FINALIZADA','ENTREGUE'])[1 + (g % 6)],
       c.id,
       v.id,
       NOW() - (g || ' minutes')::interval,
       NOW()
FROM generate_series(1, 5000) g
JOIN LATERAL (SELECT id FROM clientes ORDER BY random() LIMIT 1) c ON true
JOIN LATERAL (SELECT id FROM veiculos ORDER BY random() LIMIT 1) v ON true;

INSERT INTO orcamentos (id, ordem_servico_id, valor_total, status, criado_em, atualizado_em)
SELECT gen_random_uuid(), os.id, 500.00,
       CASE WHEN random() < 0.3 THEN 'AGUARDANDO_APROVACAO'::"StatusOrcamento" ELSE 'APROVADO'::"StatusOrcamento" END,
       NOW(), NOW()
FROM ordens_servico os
LIMIT 2000;

INSERT INTO movimentacoes_estoque (id, peca_id, tipo, quantidade, ordem_servico_id, criado_em)
SELECT gen_random_uuid(), p.id, 'BAIXA'::"TipoMovimentacaoEstoque", 1,
       CASE WHEN random() < 0.7 THEN (SELECT id FROM ordens_servico ORDER BY random() LIMIT 1) END,
       NOW() - (g || ' minutes')::interval
FROM generate_series(1, 10000) g
JOIN LATERAL (SELECT id FROM pecas ORDER BY random() LIMIT 1) p ON true;

ANALYZE;
