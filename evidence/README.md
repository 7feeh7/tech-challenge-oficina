# Evidências — Spec 010

Pasta para artefatos **sem segredos** gerados por scripts de auditoria.

| Arquivo | Origem |
| --- | --- |
| `*-branch-protection-main.json` | `scripts/security/collect-github-evidence.sh` |
| `*-environment-producao.json` | idem |
| `*-deployment-branch-policy.json` | idem |
| `*-repo-secrets-names.json` | idem (apenas nomes) |
| `auth-rate-limit-YYYYMMDD.txt` | saída de `test-auth-rate-limit.sh` |

Nunca commitar valores de secret, token ou CPF real.
