# Diagramas

Fontes textuais versionadas em **Mermaid**. O GitHub renderiza nativamente; SVGs exportados em [`rendered/`](rendered/) via [scripts/render-diagramas.sh](../../scripts/render-diagramas.sh) (aptos para PDF/README offline).

Índice de arquitetura: [../README.md](../README.md).

| Diagrama                                                     | Tipo        | Descrição                                                         |
| ------------------------------------------------------------ | ----------- | ----------------------------------------------------------------- |
| [componentes-nuvem.md](componentes-nuvem.md)                 | Componentes | Visão completa: Gateway, Functions, EKS, RDS, mensageria, Datadog |
| [sequencia-auth-cpf.md](sequencia-auth-cpf.md)               | Sequência   | Autenticação por CPF → JWT → API protegida                        |
| [sequencia-abertura-os.md](sequencia-abertura-os.md)         | Sequência   | Abertura de ordem de serviço com transação e métricas             |
| [modelo-relacional-er.md](modelo-relacional-er.md)           | ER          | Entidades, PKs, FKs e cardinalidades                              |
| [observabilidade.md](observabilidade.md)                     | Componentes | Fontes de telemetria e destinos Datadog                           |
| [diagrama-aplicacao.md](diagrama-aplicacao.md)               | Componentes | Visão do repositório `tech-challenge`                             |
| [diagrama-serverless.md](diagrama-serverless.md)             | Componentes | Visão do repositório `tech-challenge-serverless`                  |
| [diagrama-infra-kubernetes.md](diagrama-infra-kubernetes.md) | Componentes | Visão do repositório `tech-challenge-infra-kubernetes`            |
| [diagrama-infra-database.md](diagrama-infra-database.md)     | Componentes | Visão do repositório `tech-challenge-infra-database`              |
