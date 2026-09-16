# Diagrama ER — Oficina Mecânica

**Versão:** 2026-09-13
**Fonte de verdade do schema:** [`prisma/schema.prisma`](../../prisma/schema.prisma)

## Diagrama

```mermaid
erDiagram
    CLIENTE ||--o{ VEICULO : possui
    CLIENTE ||--o{ ORDEM_SERVICO : solicita
    CLIENTE ||--o{ AUDITORIA_CLIENTE_STATUS : auditado
    VEICULO ||--o{ ORDEM_SERVICO : atendido

    ORDEM_SERVICO ||--o{ ORDEM_SERVICO_SERVICO : contem
    ORDEM_SERVICO ||--o{ ORDEM_SERVICO_PECA : contem
    ORDEM_SERVICO ||--o{ ORCAMENTO : gera
    ORDEM_SERVICO ||--o{ HISTORICO_STATUS_OS : registra
    ORDEM_SERVICO ||--o{ MOVIMENTACAO_ESTOQUE : referencia

    SERVICO ||--o{ ORDEM_SERVICO_SERVICO : catalogo
    PECA ||--o{ ORDEM_SERVICO_PECA : catalogo
    PECA ||--o{ MOVIMENTACAO_ESTOQUE : movimenta

    CLIENTE {
        uuid id PK
        string nome
        string cpf_cnpj UK
        string email UK
        string telefone
        boolean ativo
        datetime criado_em
    }

    VEICULO {
        uuid id PK
        string placa UK
        uuid cliente_id FK
    }

    ORDEM_SERVICO {
        uuid id PK
        int numero UK
        enum status
        uuid cliente_id FK
        uuid veiculo_id FK
        datetime criado_em
    }

    ORDEM_SERVICO_SERVICO {
        uuid id PK
        uuid ordem_servico_id FK
        uuid servico_id FK
        int quantidade
        decimal preco_unitario
        unique ordem_servico_id_servico_id
    }

    ORDEM_SERVICO_PECA {
        uuid id PK
        uuid ordem_servico_id FK
        uuid peca_id FK
        int quantidade
        decimal preco_unitario
        unique ordem_servico_id_peca_id
    }

    ORCAMENTO {
        uuid id PK
        uuid ordem_servico_id FK
        decimal valor_total
        enum status
    }

    HISTORICO_STATUS_OS {
        uuid id PK
        uuid ordem_servico_id FK
        enum status_novo
        datetime criado_em
    }

    MOVIMENTACAO_ESTOQUE {
        uuid id PK
        uuid peca_id FK
        uuid ordem_servico_id FK_NULL
        enum tipo
        int quantidade
    }

    PECA {
        uuid id PK
        string codigo UK
        int quantidade_estoque
    }

    SERVICO {
        uuid id PK
        string nome UK
        decimal preco_base
    }

    USUARIO {
        uuid id PK
        string email UK
        enum perfil
    }
```

## Legenda de políticas `onDelete`

| Relação                    | Política   | Motivo                                                                 |
| -------------------------- | ---------- | ---------------------------------------------------------------------- |
| OS → itens (serviço/peça)  | `CASCADE`  | Itens não existem sem a OS                                             |
| OS → orçamento / histórico | `CASCADE`  | Dados derivados da OS                                                  |
| Movimentação → OS          | `SET NULL` | Preserva trilha de estoque se OS for removida (cenário administrativo) |
| Movimentação → peça        | `RESTRICT` | Impede apagar peça com movimentações                                   |
| OS → cliente / veículo     | `RESTRICT` | Impede apagar cliente com OS abertas                                   |

## Renderização

O diagrama acima é Mermaid nativo (GitHub, GitLab, VS Code). Para PNG/SVG versionado, exporte com [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli):

```bash
npx @mermaid-js/mermaid-cli -i docs/diagramas/modelo-relacional-er.md -o docs/diagramas/modelo-relacional-er.svg
```
