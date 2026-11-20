# ADR-015 — Estratégia de implantação inicial

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

Não há recursos da Fase 3 provisionados na AWS. Os três serviços e toda a infraestrutura são implantados do zero. Não há monólito em execução a transformar; a Fase 4 é uma implantação inicial. A estratégia precisa garantir deploys reproduzíveis, recuperação por reexecução e proteção contra operações destrutivas acidentais (D2.9, D9.1–D9.4).

## Decisão

**Todo o desenvolvimento é local** (D9.1): cada etapa sai da branch `develop` e volta a ela por *squash merge*; CI, testes e SonarCloud ativos durante todo o desenvolvimento. Nenhuma operação na AWS e nenhuma promoção para a `main` durante o desenvolvimento.

**Promoção `develop → main`** (D9.1): ocorre por *merge commit*, somente na implantação, na ordem do `13-deployment-runbook.md` (D2.9). Deploy só a partir da `main`, em *environment* protegido com aprovação explícita do autor.

**Ordem de implantação** (D2.9, seguindo o runbook):

1. Infraestrutura compartilhada (`tech-challenge-infra-kubernetes`): EKS, namespaces, NLB, API Gateway, IAM roles, SNS.
2. Bancos de dados (`tech-challenge-infra-database`): RDS provisionado; Job administrativo cria databases `oficina` e `billing` vazios, com usuários donos; nenhum backup necessário porque não há dados a preservar (D5.3, D9.2).
3. Serviços (OS, Billing, Execution): migrations, deploys nos namespaces próprios.
4. Lambdas (`auth-cpf`, `notificacao`): deploy.
5. Rotas no API Gateway.
6. Seed e validação do fluxo distribuído completo.

**Nenhuma operação na AWS** antes do aceite da etapa E10, que valida a proteção de deploy (D9.5).

**Migration separada do deploy** (D9.1): sem `rollout undo` automático; `namespace.yaml` fora dos pipelines dos serviços.

**Segurança no bootstrap** (D9.3): RS256 desde o início, sem HS256 (D6.3); escaladas de IAM corrigidas no código antes do primeiro `apply`; credencial administrativa temporária do bootstrap revogada assim que os pipelines via OIDC forem validados.

**Recuperação** (D9.4): falha em qualquer passo é recuperada pela reexecução segura do mesmo passo do runbook — Terraform idempotente, migrations controladas, imagens imutáveis. `destroy` não é mecanismo de recuperação; operações destrutivas exigem autorização explícita.

## Consequências

### Positivas

- Sem estado legado: a implantação inicial é mais simples e previsível.
- Terraform idempotente e imagens imutáveis permitem reexecução segura.
- Branch model simples: `develop → main` somente na implantação; sem branch de longa duração dedicada.
- Databases nascem vazios: sem backup ou ensaio de restauração antes das migrations (D9.2).

### Negativas / trade-offs

- Deploy apenas da `main` em *environment* protegido exige aprovação manual para cada promoção.
- Migration separada do deploy adiciona coordenação, mas evita rollback destrutivo (D9.4).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Branch `fase-4` de longa duração | Desnecessário; `develop` é suficiente para todo o desenvolvimento (D9.1) |
| Blue/Green ou Canary | Sem estado legado a migrar; reexecução do runbook é mecanismo suficiente |
| `terraform destroy` como rollback | Operação destrutiva; não autorizada sem aprovação explícita (D9.4) |

## Referências

- `decisoes.md` da Fase 4: D2.9, D9.1–D9.4, D9.7, D6.3
- Spec 13-deployment-runbook.md da Fase 4 (não versionada)
- [ADR-008](008-divisao-em-microsservicos.md)
