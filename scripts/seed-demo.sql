-- Seed de demonstração.
-- Idempotente: pode ser executado várias vezes sem duplicar registros demo.
-- CPFs sintéticos válidos; e-mails @example.com (nunca dados pessoais reais).
-- NÃO incluir em pipeline de deploy, docker-compose ou Job Kubernetes.

-- Cliente ativo — autenticação CPF de sucesso (529.982.247-25)
INSERT INTO clientes (id, nome, cpf_cnpj, email, telefone, ativo, criado_em, atualizado_em)
VALUES (
  '11111111-1111-4111-8111-111111111001',
  'Cliente Demo Ativo',
  '52998224725',
  'demo.ativo@example.com',
  '11999990001',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (cpf_cnpj) DO UPDATE SET
  nome = EXCLUDED.nome,
  email = EXCLUDED.email,
  telefone = EXCLUDED.telefone,
  ativo = true,
  atualizado_em = NOW();

-- Cliente inativo — autenticação CPF deve retornar 401 genérico (390.533.447-05)
INSERT INTO clientes (id, nome, cpf_cnpj, email, telefone, ativo, criado_em, atualizado_em)
VALUES (
  '11111111-1111-4111-8111-111111111002',
  'Cliente Demo Inativo',
  '39053344705',
  'demo.inativo@example.com',
  '11999990002',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (cpf_cnpj) DO UPDATE SET
  nome = EXCLUDED.nome,
  email = EXCLUDED.email,
  telefone = EXCLUDED.telefone,
  ativo = false,
  atualizado_em = NOW();

-- Veículo do cliente ativo
INSERT INTO veiculos (id, placa, marca, modelo, ano, cliente_id, criado_em, atualizado_em)
VALUES (
  '22222222-2222-4222-8222-222222222001',
  'DEM0A01',
  'Volkswagen',
  'Gol 1.6',
  2019,
  '11111111-1111-4111-8111-111111111001',
  NOW(),
  NOW()
)
ON CONFLICT (placa) DO UPDATE SET
  marca = EXCLUDED.marca,
  modelo = EXCLUDED.modelo,
  ano = EXCLUDED.ano,
  cliente_id = EXCLUDED.cliente_id,
  atualizado_em = NOW();

-- Catálogo mínimo
INSERT INTO servicos (id, nome, descricao, preco_base, tempo_estimado_min, ativo, criado_em, atualizado_em)
VALUES
  (
    '33333333-3333-4333-8333-333333333001',
    'Troca de óleo demo',
    'Serviço de demonstração — troca de óleo',
    80.00,
    30,
    true,
    NOW(),
    NOW()
  ),
  (
    '33333333-3333-4333-8333-333333333002',
    'Revisão de freios demo',
    'Serviço de demonstração — freios',
    180.00,
    90,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (nome) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  preco_base = EXCLUDED.preco_base,
  tempo_estimado_min = EXCLUDED.tempo_estimado_min,
  ativo = true,
  atualizado_em = NOW();

INSERT INTO pecas (id, codigo, nome, descricao, preco_unitario, quantidade_estoque, estoque_minimo, ativo, criado_em, atualizado_em)
VALUES
  (
    '44444444-4444-4444-8444-444444444001',
    'DEMO-FLT-001',
    'Filtro de óleo demo',
    'Peça de demonstração',
    30.00,
    10,
    2,
    true,
    NOW(),
    NOW()
  ),
  (
    '44444444-4444-4444-8444-444444444002',
    'DEMO-OLE-5W30',
    'Óleo 5W30 demo 1L',
    'Peça de demonstração',
    45.00,
    20,
    4,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  preco_unitario = EXCLUDED.preco_unitario,
  quantidade_estoque = EXCLUDED.quantidade_estoque,
  estoque_minimo = EXCLUDED.estoque_minimo,
  ativo = true,
  atualizado_em = NOW();

-- OS em diagnóstico — mudança de status dispara notificação na demo
INSERT INTO ordens_servico (
  id, status, cliente_id, veiculo_id, descricao_problema, diagnostico, criado_em, atualizado_em
)
VALUES (
  '55555555-5555-4555-8555-555555555001',
  'EM_DIAGNOSTICO',
  '11111111-1111-4111-8111-111111111001',
  '22222222-2222-4222-8222-222222222001',
  'Rangido ao frear e veículo puxando à direita (dados fictícios para demo).',
  'Pastilhas dianteiras gastas; alinhamento desregulado.',
  NOW() - INTERVAL '2 hours',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  descricao_problema = EXCLUDED.descricao_problema,
  diagnostico = EXCLUDED.diagnostico,
  atualizado_em = NOW();

-- Histórico mínimo (métricas de tempo por status)
INSERT INTO historico_status_os (id, ordem_servico_id, status_anterior, status_novo, alterado_por, criado_em)
VALUES
  (
    '66666666-6666-4666-8666-666666666001',
    '55555555-5555-4555-8555-555555555001',
    NULL,
    'RECEBIDA',
    'seed-demo',
    NOW() - INTERVAL '2 hours'
  ),
  (
    '66666666-6666-4666-8666-666666666002',
    '55555555-5555-4555-8555-555555555001',
    'RECEBIDA',
    'EM_DIAGNOSTICO',
    'seed-demo',
    NOW() - INTERVAL '90 minutes'
  )
ON CONFLICT (id) DO NOTHING;
