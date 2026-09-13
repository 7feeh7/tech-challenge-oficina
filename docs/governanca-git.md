# Governanca Git

Configuracoes de branch protection e GitHub Environments **nao sao versionadas**. Aplique em cada um dos quatro repositorios e registre evidencia.

## Estrategia de ambientes (001-R1)

- **Um unico ambiente provisionado** (`producao`), atingido exclusivamente por merge em `main`.
- **`develop`** e branch de integracao com validacao automatica, **sem credencial AWS**.
- Environment `homologacao` **nao existe** — foi removido da estrategia.

## Branches protegidas

### `main` (unico caminho para a nuvem)

- [ ] Bloquear commits diretos
- [ ] Exigir Pull Request antes do merge
- [ ] Exigir >= 1 aprovacao
- [ ] Exigir status checks: `PR Validation`
- [ ] Bloquear force-push e exclusao

### `develop` (integracao)

- [ ] Exigir Pull Request (recomendado) ou permitir push direto da equipe
- [ ] Exigir status checks de `PR Validation` como obrigatorios
- [ ] Bloquear force-push e exclusao

## GitHub Environment `producao`

| Configuracao | Valor |
| --- | --- |
| Deployment branch policy | Apenas `main` |
| Aprovacao manual | Recomendada (reviewers antes do deploy) |
| Secrets | Credenciais AWS, TF state, JWT, SendGrid, DB, admin |

### Por que secrets ficam no Environment e nao no repositorio

Secret de **repositorio** e legivel por qualquer workflow, em **qualquer branch**. Secret de **Environment** so e injetado quando o job declara `environment: producao` **e** a branch atende a deployment branch policy. Isso impede que um workflow malicioso em `develop` obtenha credencial de escrita.

### Secrets por escopo (quatro repos)

| Escopo | Nomes (sem valores) |
| --- | --- |
| Repositorio | `SONAR_TOKEN` |
| Environment `producao` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE`, `JWT_SECRET`, `SENDGRID_API_KEY`, `DB_SECRET_ARN`, `ADMIN_SENHA`, `LAMBDA_ARTIFACTS_BUCKET` |

**Acao obrigatoria:** mover secrets de nuvem do nivel repositorio para `producao` e **rotacionar** os valores movidos.

## Script de evidencia

```bash
OWNER=<org>
REPOS="tech-challenge tech-challenge-serverless tech-challenge-infra-kubernetes tech-challenge-infra-database"

for REPO in $REPOS; do
  gh api "repos/${OWNER}/${REPO}/branches/main/protection" > "evidence/${REPO}-branch-protection-main.json"
  gh api "repos/${OWNER}/${REPO}/environments/producao" > "evidence/${REPO}-environment-producao.json"
  gh api "repos/${OWNER}/${REPO}/environments/producao/deployment-branch-policies" > "evidence/${REPO}-deployment-branch-policy.json"
  gh api "repos/${OWNER}/${REPO}/actions/secrets" > "evidence/${REPO}-repo-secrets-names.json"
  gh api "repos/${OWNER}/${REPO}/environments/producao/secrets" > "evidence/${REPO}-env-secrets-names.json"
done
```

### Teste de imposicao (deployment branch policy)

Em branch de teste, adicionar job:

```yaml
jobs:
  probe:
    runs-on: ubuntu-latest
    environment: producao
    steps:
      - run: echo "deve falhar fora de main"
```

O GitHub deve recusar a execucao com erro de deployment branch policy.

## OIDC (spec 010)

Implementado em `tech-challenge-infra-kubernetes/terraform/github-oidc.tf`. Cada repositório possui role IAM própria; trust policy exige `ref:refs/heads/main`.

Workflows usam:

```yaml
permissions:
  id-token: write
  contents: read
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
```

ARNs publicados no SSM (`github_role_*_arn`). Configurar `AWS_DEPLOY_ROLE_ARN` no Environment `producao` de cada repo. Revogar access keys após bootstrap.

Procedimento de rotação: [rotacao-segredos.md](seguranca/rotacao-segredos.md).

## Referencias

- [ADR-001 — Ambiente unico](adrs/001-ambiente-unico-provisionado.md)
- [CI/CD](ci-cd.md)
