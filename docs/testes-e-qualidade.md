# Testes e Qualidade

## Testes

```bash
yarn test               # unitários
yarn test:cov           # cobertura
yarn test:e2e           # end-to-end
```

Domínios críticos (`clientes`, `veiculos`, `servicos`, `ordens-servico`, `orcamentos`) seguem o padrão **Arrange / Act / Assert** com mínimo de 80% de cobertura.

### Cobertura de testes

<img width="1452" height="943" alt="cobertura" src="../assets/cobertura.jpg" />

## Qualidade de código (SonarQube)

```bash
yarn sonar:up      # sobe o SonarQube local
yarn sonar         # roda testes com cobertura + scanner
yarn sonar:down    # encerra o SonarQube
```

SonarQube fica em `http://localhost:9000`.

O `yarn lint` (ESLint com autofix) e o `yarn format` (Prettier) completam o ciclo — o lint também roda como primeiro passo do pipeline, ver [ci-cd.md](ci-cd.md).
