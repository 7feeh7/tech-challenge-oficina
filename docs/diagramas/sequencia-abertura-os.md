# Sequência — abertura de ordem de serviço

**Versão:** 2026-09-13
**Implementação:** `CriarOrdemServicoUseCase`, `PrismaOrdemServicoGateway.criar`, `OrdensServicoController.create`.

```mermaid
sequenceDiagram
    autonumber
    participant C as Atendente (JWT interno)
    participant GW as API Gateway
    participant API as oficina-api
    participant UC as CriarOrdemServicoUseCase
    participant CAT as CatalogoGateway
    participant G as PrismaOrdemServicoGateway
    participant DB as RDS PostgreSQL
    participant M as OsMetricsService

    C->>GW: POST /v1/ordens-servico + Bearer JWT
    GW->>API: Proxy /v1/*
    API->>API: JwtAuthGuard + Roles(ATENDENTE|ADMIN|MECANICO)

    API->>UC: execute({ clienteId, veiculoId, servicos, pecas })

    UC->>CAT: clienteExiste(clienteId)
    alt Cliente não encontrado
        UC-->>API: ClienteDaOrdemNaoEncontradoError → 404
    end

    UC->>CAT: buscarVeiculo(veiculoId)
    alt Veículo inexistente ou de outro cliente
        UC-->>API: VeiculoDaOrdemNaoEncontradoError / VeiculoNaoPertenceAoClienteError
    end

    UC->>CAT: Validar serviços/peças do catálogo
    UC->>UC: Monta entidade OrdemServico (status RECEBIDA)

    UC->>G: criar(ordem, { statusAnterior: null, statusNovo: RECEBIDA })
    G->>DB: BEGIN TRANSACTION
    G->>DB: INSERT ordens_servico + itens serviço/peça
    G->>DB: INSERT historico_status_os (OS criada)
    G->>DB: COMMIT

    G->>M: recordOsCriada() — métrica oficina.ordem_servico.criada
    G-->>UC: OrdemServicoDetalhe
    UC-->>API: OrdemServicoOutput
    API-->>GW: 201 Created + X-Correlation-Id
    GW-->>C: 201
```

## Notas de implementação

- Autenticação interna via `POST /v1/auth/login` (não CPF); rota exige perfil `ATENDENTE`, `ADMINISTRADOR` ou `MECANICO`.
- Decorator `@Idempotent('ordens-servico.create')` evita duplicidade em retries.
- Notificação por e-mail ocorre apenas em **transição de status** (`PATCH`), não na abertura.
- Preços unitários são congelados nos itens da OS no momento da criação.

## Referências

- [regras-de-negocio.md](../regras-de-negocio.md)
- [api.md](../api.md) — `POST /v1/ordens-servico`
