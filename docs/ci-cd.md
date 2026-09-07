# Pipeline CI/CD

<img width="1201" height="811" alt="deploy" src="../assets/deploy.png" />

Definido em [.github/workflows/deploy.yml](../.github/workflows/deploy.yml), executa **apenas na branch `main`**:

1. **Build & testes** — `yarn install`, `yarn lint`, `yarn build`, `yarn test:cov`.
2. **Imagem Docker** — build e push para o **ECR** (tags `sha` e `latest`).
3. **Deploy** — `aws eks update-kubeconfig`, cria/atualiza o Secret a partir dos GitHub Secrets, aplica os manifestos e aguarda o `rollout`.

As migrations rodam num Job do Kubernetes antes do `rollout` — o porquê está em [infraestrutura.md](infraestrutura.md).

## GitHub Secrets necessários

| Secret                                        | Descrição                                                        |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciais AWS para o deploy.                                   |
| `AWS_REGION`                                  | Região (ex.: `us-east-1`).                                       |
| `ECR_REPOSITORY`                              | URL do repositório ECR (`terraform output ecr_repository_url`).  |
| `EKS_CLUSTER_NAME`                            | Nome do cluster (`terraform output cluster_name`).               |
| `DATABASE_URL`                                | Connection string do RDS (`terraform output -raw database_url`). |
| `JWT_SECRET`                                  | Segredo de assinatura do JWT.                                    |
| `SENDGRID_API_KEY`                            | Chave do SendGrid (pode ficar vazio).                            |
| `ADMIN_SENHA`                                 | Senha do administrador inicial.                                  |
