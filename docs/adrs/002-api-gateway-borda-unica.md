# ADR-002 — API Gateway como borda única

**Status:** aceito  
**Data:** 2026-09-13  
**RFC relacionada:** [RFC-003](../rfcs/003-autenticacao-cpf-jwt.md)

## Contexto

A solução expõe autenticação serverless (`POST /auth/cpf`) e APIs de negócio no EKS. Sem uma borda definida, o Service Kubernetes `LoadBalancer` criava um caminho público paralelo que contornava CORS, throttling e logs centralizados.

## Decisão

1. **AWS HTTP API Gateway** é a única entrada pública.
2. **`POST /auth/cpf`** integra por proxy com a Lambda (spec 002).
3. **APIs `/v1/*`, `/health` e `/docs`** integram com o EKS via VPC Link → NLB interno → NodePort 30080.
4. **JWT e autorização de ownership/perfil** permanecem na aplicação NestJS (guards existentes).
5. O Gateway controla: exposição, roteamento, CORS, throttling, TLS (HTTPS nativo), access logs e `X-Correlation-Id` na borda.
6. **Service Kubernetes** deixa de ser `LoadBalancer`; tráfego externo só chega pelo NLB privado.

## Consequências

### Positivas

- Um único contrato de URL para consumidores externos.
- Logs de acesso centralizados sem gravar `Authorization`.
- CORS e rate limit configuráveis por ambiente via Terraform.
- NLB interno elimina bypass público do ELB.

### Negativas / trade-offs

- Swagger (`/docs`) fica publicamente acessível — decisão consciente em ambiente único.
- Domínio customizado depende de DNS/TLS adicional; até lá usa-se URL nativa do Gateway.
- WAF não provisionado nesta fase (throttling + app guards suficientes por ora).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| ELB público direto no EKS | Bypass dos controles do Gateway |
| JWT authorizer no Gateway | Duplica regras de ownership/perfil já na app |
| ALB Ingress Controller | Mais complexo; NLB + VPC Link atende HTTP API |

## Referências

- [gateway-rotas.md](../gateway-rotas.md)
- [diagramas/componentes-nuvem.md](../diagramas/componentes-nuvem.md)
