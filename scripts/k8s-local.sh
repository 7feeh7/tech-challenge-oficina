#!/usr/bin/env bash
#
# Sobe a aplicação inteira no cluster Kubernetes LOCAL (Docker Desktop) para
# demonstrar o Horizontal Pod Autoscaler sem depender da AWS.
#
#   bash scripts/k8s-local.sh
#
# Diferenças em relação ao deploy de produção (EKS):
#   - imagem construída localmente (oficina-api:local) em vez de vir do ECR;
#   - Postgres roda como pod (k8s/local/postgres.yaml) em vez do RDS;
#   - metrics-server instalado aqui; no EKS quem instala é o Terraform.
#
# Requisitos: Docker Desktop com Kubernetes habilitado, kubectl no PATH.
set -euo pipefail

NS=oficina
IMAGE=oficina-api:local

# O manifesto de produção aponta para o ECR e usa "Always"; local, a imagem já
# está no nó e não há registry de onde puxar.
localizar() {
  sed -e "s|ECR_REPOSITORY_URL:latest|${IMAGE}|g" \
      -e "s|imagePullPolicy: Always|imagePullPolicy: IfNotPresent|g" "$1"
}

echo "==> 1/6 Build da imagem (${IMAGE})"
docker build -t "${IMAGE}" .

echo "==> 2/6 metrics-server (sem ele o HPA mostra <unknown> e nunca escala)"
if ! kubectl get deployment metrics-server -n kube-system >/dev/null 2>&1; then
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml
  # O kubelet do Docker Desktop usa certificado self-signed; sem esta flag o
  # metrics-server não consegue coletar as métricas dos nós.
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
fi
kubectl rollout status deployment/metrics-server -n kube-system --timeout=180s

echo "==> 3/6 Namespace, ConfigMap, Secret e Postgres local"
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/local/postgres.yaml

# Secret local — valores fakes para teste local, o Secret real do EKS vem do CI/CD.
kubectl create secret generic oficina-secret --namespace "${NS}" \
  --from-literal=DATABASE_URL='postgresql://oficina:oficina@postgres:5432/oficina?schema=public' \
  --from-literal=JWT_SECRET='segredo-apenas-local' \
  --from-literal=SENDGRID_API_KEY='' \
  --from-literal=ADMIN_SENHA='admin12345' \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout status deployment/postgres --namespace "${NS}" --timeout=180s

echo "==> 4/6 Migrations (mesmo Job usado em produção)"
kubectl delete job oficina-migrate --namespace "${NS}" --ignore-not-found
localizar k8s/migration-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete job/oficina-migrate \
  --namespace "${NS}" --timeout=300s

echo "==> 5/6 Deployment, Service e HPA"
localizar k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl rollout status deployment/oficina-api --namespace "${NS}" --timeout=300s

echo "==> 6/6 Pronto"
kubectl get pods,svc,hpa --namespace "${NS}"

cat <<'FIM'

A API está em http://localhost (o Docker Desktop publica o Service LoadBalancer
na porta 80) e o Swagger em http://localhost/docs.

Para o teste de carga, em dois terminais:

  1) observe o autoescalonamento:
       kubectl get hpa -n oficina -w

  2) gere carga:
       npx autocannon -c 100 -d 120 http://localhost/health

Para derrubar tudo:
       bash scripts/k8s-local-down.sh
FIM
