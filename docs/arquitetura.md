# Arquitetura e Estrutura do Projeto

**Todos os módulos de negócio seguem a Clean Architecture**: as dependências apontam sempre de fora para dentro (`infra` → `application` → `domain`), e a camada de domínio não conhece NestJS, Prisma nem HTTP. Cada módulo tem a mesma anatomia — `domain/` (entidades, enums e erros), `application/` (casos de uso, portas e mappers) e `infra/` (controllers, DTOs e adaptadores de persistência).

Um módulo está aberto abaixo para mostrar a anatomia; os demais seguem exatamente a mesma estrutura. A pasta `modules/` concentra os bounded contexts da API; `shared/` concentra infraestrutura e utilitários transversais.

```
src/
├── modules/                         # Módulos NestJS (bounded contexts)
│   ├── ordens-servico/              # CRUD de OS (exemplo expandido)
│   │   ├── domain/                  # Camada mais interna — zero dependências externas
│   │   │   ├── entities/            # OrdemServico (máquina de estados) e itens com preço congelado
│   │   │   ├── errors/              # Erros de domínio da OS (herdam de DomainError)
│   │   │   └── status-os.ts         # Enum de domínio + transições válidas
│   │   ├── application/             # Regras da aplicação — não conhece Nest nem Prisma
│   │   │   ├── ports/               # Interfaces implementadas pela infra (inversão de dependência)
│   │   │   ├── use-cases/           # Um caso de uso por arquivo, classes puras (sem decorators)
│   │   │   └── mappers/             # Entidade → saída da API
│   │   ├── infra/                   # Adaptadores — camada mais externa
│   │   │   ├── http/                # Controllers + DTOs (class-validator + Swagger)
│   │   │   ├── notification/        # SendGrid: avisa o cliente a cada mudança de status
│   │   │   └── persistence/         # PrismaOrdemServicoGateway (transação: OS + itens + histórico)
│   │   └── ordens-servico.module.ts # Wiring: liga as portas aos adaptadores
│   ├── usuarios/                    # CRUD de usuários + seed do administrador inicial
│   ├── auth/                        # Autenticação JWT + autorização por perfil (@Public, @Roles, guards)
│   ├── clientes/                    # CRUD de clientes (CPF/CNPJ validado)
│   ├── veiculos/                    # CRUD de veículos (placa Mercosul/antiga validada)
│   ├── servicos/                    # Catálogo de serviços
│   ├── pecas/                       # Catálogo de peças/insumos
│   ├── movimentacoes-estoque/       # Controle de estoque (entrada/baixa atômica)
│   ├── orcamentos/                  # Orçamentos: aprovar/rejeitar (aprovar dá baixa no estoque)
│   └── health/                      # Endpoints de liveness/readiness (probes do Kubernetes)
│
├── shared/                          # Código compartilhado entre módulos
│   ├── exceptions/                  # DomainError
│   ├── filters/                     # Filtro HTTP de exceções de domínio
│   ├── validators/                  # Validador CPF/CNPJ
│   ├── database/                    # PrismaService e PrismaModule
│   └── generated/prisma/            # Client gerado pelo Prisma (não versionar manualmente)
│
├── app.module.ts                    # Composição raiz: módulos, guards e filtros globais
└── main.ts                          # Bootstrap (Fastify, ValidationPipe, Swagger)
```

## Camadas e regra de dependência

| Camada        | O que vive aqui                                       | Pode depender de                |
| ------------- | ----------------------------------------------------- | ------------------------------- |
| `domain`      | Entidades, enums e erros de negócio                   | Nada (nem framework, nem banco) |
| `application` | Casos de uso, portas e mappers de saída               | `domain`                        |
| `infra`       | Controllers, DTOs HTTP, gateway Prisma, hasher bcrypt | `application` e `domain`        |
