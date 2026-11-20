# Manifestos Kubernetes (EKS)

Deploy da API NestJS no cluster Kubernetes.

## Arquivos

| Arquivo | Recurso | Descrição |
| --- | --- | --- |
| `namespace.yaml` | Namespace | Isola os recursos da aplicação (`oficina`). Provisionado pelo `infra-kubernetes`; fora do pipeline da aplicação (D6.2, D9.1). |
| `serviceaccount.yaml` | ServiceAccount | IRSA da API (`oficina-api`): SNS e SQS. Anotada pelo `deploy.yml` com o ARN de `/infra/os_service_irsa_role_arn`. |
| `configmap.yaml` | ConfigMap | Variáveis não sensíveis (`PORT`, `ADMIN_EMAIL`, etc.), URLs das filas e do tópico (marcadores `__...__` preenchidos pelo `deploy.yml` com o SSM), processadores desligados (`false`) e tempos dos processadores. |
| `secret.example.yaml` | Secret | Modelo dos dados sensíveis da API (`DATABASE_URL`, chaves JWT, tokens, `ADMIN_SENHA`). O `oficina-secret` real é criado só pelo `deploy.yml`. |
| `migration-job.yaml` | Job | Aplica as migrations com a mesma imagem do deploy. Roda dentro do `deploy.yml` (entre o build e o rollout) e, em manutenção, pelo `migrate.yml` (`workflow_dispatch` na `main`). Lê só o Secret `oficina-migrate-secret-<id>` (`DATABASE_URL`); Job e Secret têm nome único por run (`<id>` = `<run_id>-<tentativa>`); não usa ConfigMap nem IRSA. |
| `deployment.yaml` | Deployment | 1 réplica inicial, `RollingUpdate`, `securityContext` non-root, spread multi-AZ, probes; tag de imagem por SHA no CI; `terminationGracePeriodSeconds` de 1020 s (cálculo em `docs/tempos-processadores-os.md`). |
| `service.yaml` | Service | Tipo `NodePort` (30080), tráfego público só via API Gateway + NLB interno. |
| `pdb.yaml` | PodDisruptionBudget | Garante `minAvailable: 1` durante evictions e rollouts. |
| `hpa.yaml` | HorizontalPodAutoscaler | Escala de 1 a 6 pods por CPU (70%) e memória (80%) (D5.5, D6.7). |

## Deploy manual (o CI/CD faz isso automaticamente)

```bash
# 1. Aponte o kubectl para o cluster EKS
aws eks update-kubeconfig --region us-east-1 --name tech-challenge-eks

# 2. Namespace e configuração
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml

# 3. Crie os Secrets com os valores reais (não use o example em produção).
#    O da migration leva só a DATABASE_URL.
kubectl create secret generic oficina-migrate-secret-manual -n oficina \
  --from-literal=DATABASE_URL='postgresql://oficina:senha@ENDPOINT_RDS:5432/oficina?schema=public'
kubectl create secret generic oficina-secret -n oficina \
  --from-literal=DATABASE_URL='postgresql://oficina:senha@ENDPOINT_RDS:5432/oficina?schema=public' \
  --from-literal=JWT_PRIVATE_KEY='...' \
  --from-literal=JWT_PUBLIC_KEY='...' \
  --from-literal=TOKEN_BILLING_OS='...' \
  --from-literal=TOKEN_EXECUTION_OS='...' \
  --from-literal=TOKEN_AUTH_CPF_OS='...' \
  --from-literal=ADMIN_SENHA='...'

# 4. Rode as migrations (Job) e espere terminar, ANTES de subir a API.
#    Ajuste a imagem (URL do ECR) no manifesto e troque __MIGRATION_ID__ por `manual`.
sed 's|__MIGRATION_ID__|manual|g' migration-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete job/oficina-migrate-manual -n oficina --timeout=300s
kubectl delete job oficina-migrate-manual -n oficina   # libera as conexões antes do rollout

# 5. Ajuste a imagem no deployment (URL do ECR) e aplique
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
```

> As migrations rodam só neste Job — o container da API sobe direto com `yarn start:prod`.
> Isso evita que cada pod criado pelo HPA repita o `migrate deploy` durante um pico de carga.

## Ordem no pipeline

No `deploy.yml`, uma run por commit na `main`: `test` → `build` (imagem com tag SHA) → `migration` (este Job, com a mesma imagem, até `Complete`; removido ao terminar) → `deploy` (rollout com a mesma tag). Falha na migration impede o rollout e o Deployment anterior segue no ar. O `migrate.yml` só existe para manutenção manual.

## Verificação

```bash
kubectl get pods -n oficina
kubectl get svc -n oficina           # NodePort 30080 (sem IP público)
kubectl get hpa -n oficina           # métricas (requer metrics-server)
```

Acesse a API pela URL do API Gateway (SSM `api_gateway_url`): `GET /health`, `GET /docs` e rotas `/v1/*`. O Service não provisiona ELB público.

## Cluster local (Docker Desktop)

Dá para rodar a aplicação inteira — e demonstrar o HPA — sem subir nada na AWS.
Habilite o Kubernetes no Docker Desktop e rode:

```bash
bash scripts/k8s-local.sh
```

O script builda a imagem local, instala o **metrics-server** (o Docker Desktop não
traz um, e sem ele o HPA fica com `<unknown>` e nunca escala), sobe um Postgres em
pod no lugar do RDS, roda o Job de migrations e aplica Deployment, Service e HPA.
A API fica em `http://localhost`.

Para remover tudo: `bash scripts/k8s-local-down.sh`.

## Testar a escalabilidade (HPA)

Em um terminal, observe as réplicas:

```bash
kubectl get hpa -n oficina -w
```

Em outro, gere carga. **Local** (o Service é publicado em `localhost:80`):

```bash
npx autocannon -c 100 -d 120 http://localhost/health
```

**No EKS**, gere a carga de dentro do cluster — assim ela não depende da sua banda
nem do ELB:

```bash
kubectl run -n oficina load --image=busybox --restart=Never --rm -it -- \
  /bin/sh -c "while true; do wget -q -O- http://oficina-api/health; done"
```

O HPA escala por CPU (alvo de 70% de `100m`, ou seja ~70m por pod), então é a CPU
que dispara primeiro. Ele lê as métricas a cada ~15s e espera 5 min de calmaria
antes de reduzir as réplicas — não estranhe se a descida demorar bem mais que a
subida.
