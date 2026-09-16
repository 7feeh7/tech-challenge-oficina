# Manifestos Kubernetes (EKS)

Deploy da API NestJS no cluster Kubernetes.

## Arquivos

| Arquivo | Recurso | Descrição |
| --- | --- | --- |
| `namespace.yaml` | Namespace | Isola os recursos da aplicação (`oficina`). |
| `serviceaccount.yaml` | ServiceAccount | IRSA para publicação SNS (`oficina-api`). |
| `configmap.yaml` | ConfigMap | Variáveis não sensíveis (`PORT`, `ADMIN_EMAIL`, etc.). |
| `secret.example.yaml` | Secret | Modelo dos dados sensíveis (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_SENHA`). O Secret real é criado pelo CI/CD. |
| `migration-job.yaml` | Job | Aplica as migrations do Prisma **uma vez por deploy**, antes do rollout da API. |
| `deployment.yaml` | Deployment | 2 réplicas, `RollingUpdate`, `securityContext` non-root, spread multi-AZ, probes. |
| `service.yaml` | Service | Tipo `NodePort` (30080), tráfego público só via API Gateway + NLB interno. |
| `pdb.yaml` | PodDisruptionBudget | Garante `minAvailable: 1` durante evictions e rollouts. |
| `hpa.yaml` | HorizontalPodAutoscaler | Escala de 2 a 10 pods por CPU (70%) e memória (80%). |

## Deploy manual (o CI/CD faz isso automaticamente)

```bash
# 1. Aponte o kubectl para o cluster EKS
aws eks update-kubeconfig --region us-east-1 --name tech-challenge-eks

# 2. Namespace e configuração
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml

# 3. Crie o Secret com os valores reais (não use o example em produção)
kubectl create secret generic oficina-secret -n oficina \
  --from-literal=DATABASE_URL='postgresql://oficina:senha@ENDPOINT_RDS:5432/oficina?schema=public' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=SENDGRID_API_KEY='...' \
  --from-literal=ADMIN_SENHA='...'

# 4. Rode as migrations (Job) e espere terminar, ANTES de subir a API.
#    Ajuste a imagem (URL do ECR) no manifesto antes de aplicar.
kubectl delete job oficina-migrate -n oficina --ignore-not-found
kubectl apply -f migration-job.yaml
kubectl wait --for=condition=complete job/oficina-migrate -n oficina --timeout=300s

# 5. Ajuste a imagem no deployment (URL do ECR) e aplique
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f hpa.yaml
```

> As migrations rodam só neste Job — o container da API sobe direto com `yarn start:prod`.
> Isso evita que cada pod criado pelo HPA repita o `migrate deploy` durante um pico de carga.

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
