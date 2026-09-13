# Checklist — Publicação de Vídeo e PDF

Revisar **antes** de publicar artefatos de entrega.

## Dados proibidos

- [ ] CPF real de pessoa viva
- [ ] E-mail pessoal real (usar sintético `@example.com` ou mascarado)
- [ ] Token JWT completo
- [ ] Senha ou chave API
- [ ] URL com credencial de banco
- [ ] Conteúdo de Secrets Manager / GitHub Secrets
- [ ] Logs com PII não mascarado

## Dados permitidos (demonstração)

- CPF sintético válido do `scripts/seed-demo.sql` (ex.: `529.982.247-25`)
- Token truncado (`eyJ... [redacted]`)
- IPs de exemplo RFC 5737 (`203.0.113.x`)

## Capturas

- [ ] Terminal: sem export de env com segredos
- [ ] Postman: variáveis de ambiente sem valores reais de produção
- [ ] Datadog: dashboards sem query contendo PII

## Aprovação

| Revisor | Data | OK |
| --- | --- | --- |
| | | |
