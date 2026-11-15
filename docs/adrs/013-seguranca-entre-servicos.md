# ADR-013 — Segurança entre serviços

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

Três serviços comunicam-se por HTTP interno e SQS. As rotas internas do OS não podem ser expostas publicamente. Billing e Execution precisam provar identidade ao chamar o OS. A Lambda `auth-cpf` precisa consultar clientes sem credenciais de banco. Todos os serviços usam RS256 desde o início; não há tokens HS256 a aceitar nem transição a tratar (D6.3). Segredos de banco, pagamento e JWT precisam de isolamento por serviço (D6.5).

## Decisão

**Tokens por chamador** (D3.13): cada relação chamador → chamado tem um token próprio. Billing usa token ao chamar o OS; Execution usa token ao chamar o OS; `auth-cpf` usa token ao chamar o OS. Autorização restrita às operações necessárias para cada chamador.

**JWT RS256** (D6.3): OS Service e Lambda `auth-cpf` têm a chave privada para emitir tokens; Billing e Execution recebem só a chave pública. Validação de assinatura, algoritmo, expiração, emissor e audiência obrigatórios. Só RS256 desde o início; não há tokens HS256 a aceitar nem transição a tratar (D6.3).

**Rotas internas** (D2.27): sob `/internal`, fora do encaminhamento público do API Gateway (D6.6). O prefixo não é proteção suficiente; a proteção real é por token de chamador e por rede.

**IAM e infraestrutura** (D6.1, D6.2): criação de roles centralizada no `tech-challenge-infra-kubernetes`; pipelines dos microsserviços sem administração de IAM; CI de cada serviço restrito ao próprio namespace e recursos; GitHub Actions com OIDC e credenciais temporárias.

**Segredos por finalidade** (D6.5): cada segredo tem um único responsável e um único caminho de distribuição:

| Segredo | Responsável | Caminho |
| --- | --- | --- |
| Credenciais do banco (master e usuários) | `tech-challenge-infra-database` | Job administrativo em `administracao` (D5.3) |
| Par RS256 e tokens por relação | `tech-challenge-infra-kubernetes` | `Secret` do namespace por serviço |
| Credenciais do Mercado Pago | Billing | `Secret` do namespace `billing` |

A IRSA das aplicações não lê o Secrets Manager diretamente. Só o Job administrativo (D5.3) e a Lambda `auth-cpf` fazem leituras diretas do Secrets Manager.

**Namespace `administracao`** (D5.3): o Job administrativo que cria databases e usuários roda neste namespace, gerenciado pelo `tech-challenge-infra-kubernetes`. Microsserviços não criam workloads nem leem segredos em `administracao`.

**Webhook do Mercado Pago** (D3.13): protegido pela validação de assinatura exigida pelo Mercado Pago; é a única rota do Billing exposta publicamente pelo API Gateway.

**`NetworkPolicy`** (D6.4, D7.5): não habilitada nesta fase pela baixa eficácia no desenho NodePort/VPC CNI. Limitação e risco documentados no README.

## Consequências

### Positivas

- Nenhuma rota interna exposta publicamente (D2.27, D6.6).
- Isolamento de segredos por serviço e por finalidade; credenciais master nunca distribuídas aos pods.
- RS256: Billing e Execution não podem emitir tokens válidos mesmo se comprometidos.
- OIDC no CI elimina credenciais estáticas de longa duração.

### Negativas / trade-offs

- Sem `NetworkPolicy`: namespace e `ClusterIP` não são isolamento de rede suficiente (D6.4); risco residual documentado.
- Rotação de tokens por relação exige deploy coordenado.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Service mesh (Istio, Linkerd) | Custo e complexidade; D0.3, D6.4 |
| Permissions boundaries complexos | Fora do escopo desta fase; D6.2 |
| `NetworkPolicy` | Baixa eficácia no desenho atual; D6.4 |
| Microsserviço de autenticação | Dependência nova sem justificativa; D6.3 |

## Referências

- `decisoes.md` da Fase 4: D3.13, D6.1–D6.7, D2.27, D5.3
- Spec 07-infrastructure.md da Fase 4 (não versionada)
- [ADR-008](008-divisao-em-microsservicos.md)
