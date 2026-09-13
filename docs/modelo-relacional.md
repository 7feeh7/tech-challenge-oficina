# Modelo relacional e integridade

Documento de apoio à [spec 006](../spec/changes/006-banco-gerenciado-e-modelo-relacional/spec.md). Decisão arquitetural em [ADR-003](adr/003-postgresql-banco-gerenciado.md). Diagrama em [diagramas/modelo-relacional-er.md](diagramas/modelo-relacional-er.md).

## Separação de responsabilidades

| Camada | Repositório | Responsabilidade |
| --- | --- | --- |
| Serviço RDS | `tech-challenge-infra-database` | VPC privada, TLS, backup, secrets, SG |
| Schema/tabelas | `tech-challenge/prisma` | Entidades, FKs, índices, migrations |

## Cliente e autenticação por CPF

- Campo `clientes.ativo` (`BOOLEAN NOT NULL DEFAULT true`) suporta bloqueio de login por CPF sem apagar histórico.
- Backfill: migration `20260913140000_cliente_ativo` aplica `DEFAULT true` — registros legados ficam ativos.
- `cpf_cnpj` é **único** e normalizado na aplicação (somente dígitos).
- A Lambda de auth consulta **somente CPF** (`LENGTH(cpf_cnpj) = 11`) com query parametrizada e índice único em `cpf_cnpj` — ver `tech-challenge-serverless/src/shared/services/cliente.repository.ts`.
- CNPJ permanece no mesmo campo para clientes PJ internos; a Function de portal do cliente não autentica CNPJ.

## Tabelas de junção da OS

`ordens_servico_servicos` e `ordens_servico_pecas` possuem **`UNIQUE (ordem_servico_id, servico_id|peca_id)`** para impedir duplicidade acidental do mesmo item na mesma OS. A migration `20260913180000_modelo_relacional_006` remove duplicatas legadas (mantém a linha mais antiga) antes de aplicar a constraint.

Quantidade repetida do mesmo serviço/peça deve ser modelada aumentando `quantidade`, não inserindo segunda linha.

## Movimentação de estoque e OS

Quando `movimentacoes_estoque.ordem_servico_id` está preenchido (baixa por OS), existe FK para `ordens_servico.id` com **`ON DELETE SET NULL`**: a movimentação permanece no histórico de estoque mesmo se a OS for removida administrativamente.

## Constraints de domínio (CHECK)

Complementam validações da aplicação (defesa em profundidade):

| Tabela | Constraint | Regra |
| --- | --- | --- |
| `servicos` | `preco_base >= 0`, `tempo_estimado_min > 0` | Preço e tempo válidos |
| `pecas` | `preco_unitario >= 0`, `quantidade_estoque >= 0`, `estoque_minimo >= 0` | Estoque não negativo |
| `ordens_servico_*` | `quantidade >= 1`, `preco_unitario >= 0` | Itens de OS válidos |
| `orcamentos` | `valor_total >= 0` | Orçamento não negativo |
| `movimentacoes_estoque` | `quantidade > 0` | Movimentação sempre positiva |

## Tipos monetários

Valores monetários usam `DECIMAL(10,2)` no PostgreSQL via Prisma — evita erros de ponto flutuante em totais de orçamento e preços unitários snapshot na OS.

## Índices (resumo)

Ver detalhamento e metas de tempo em [performance-banco.md](performance-banco.md).

| Consulta | Índice |
| --- | --- |
| Fila de OS por status + antiguidade | `(status, criado_em)` |
| Volume diário / marcos temporais | `(criado_em)` |
| Orçamento pendente por OS | `(ordem_servico_id, status)` |
| Histórico cronológico | `(ordem_servico_id, criado_em)` |
| Movimentações por peça | `(peca_id, criado_em)` |
| Auth CPF | unique em `cpf_cnpj` |
