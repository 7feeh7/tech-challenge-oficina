# ADR-015 — Estratégia de virada do monólito para microsserviços

**Status:** aceito  
**Data:** 2026-11-15

## Contexto

O `tech-challenge` está em produção como monólito. A Fase 4 transforma-o no OS Service enquanto o Billing e o Execution são criados do zero. A virada não pode deixar o estado distribuído inconsistente, e cada etapa precisa de aprovação explícita do autor antes de operações destrutivas ou na AWS (D9.1, D9.5).

## Decisão

**Branch de longa duração** `fase-4` no OS Service, com CI, testes e SonarCloud ativos, sem deploy automático (D9.1). Antes da virada: deployment com estratégia `Recreate`; sem `rollout undo` automático; migrations separadas do deployment.

**Ordem da virada** (D2.9):
1. Lambda de notificação: confirmação de que o SNS existente continua funcionando.
2. Billing e Execution: deploy nos namespaces próprios.
3. Validação isolada (rota de webhook, chaves RS256, token de teste); o fluxo legado e o novo não alteram a mesma OS.
4. Interrupção do fluxo anterior.
5. Migrations destrutivas (com backup lógico do database afetado e ensaio de restauração).
6. Novo OS Service.
7. Rotas no API Gateway.
8. Seed e validação do fluxo distribuído completo.

**Nenhuma operação na AWS** antes do aceite do autor da etapa E10, que valida a proteção de deploy (D9.7, D9.5).

**Reset autorizado do database `oficina`** (D9.2): sem dados reais; backup antes; ensaio de restauração num database temporário; reaproveitar o seed existente; sem afetar o database do Billing.

**Rollback** (D9.4): após operações distribuídas, restaurar só o database do OS gera inconsistência com Billing, Execution, SQS e Mercado Pago. Rollback diferenciado antes e depois da liberação do fluxo distribuído; documentar condições de interrupção e conciliação de estados. Sem rollback destrutivo automático.

**Transição de tokens** (D9.3): Billing e Execution usam só RS256 desde a criação; HS256 restrito ao fluxo legado, com prazo de remoção; acesso da `auth-cpf` ao banco removido assim que a nova integração for validada; credenciais estáticas administrativas revogadas assim que os acessos substitutos forem validados.

**Migration destrutiva de `orcamentos`** na Onda 9 (D9.3): separada e condicionada à autorização do autor, com backup e ensaio antes.

**Ondas** (D9.7): 42 etapas; a ordem é determinada pelas dependências, não pela numeração. Ondas 1 e 2 (infraestrutura e prova técnica do Mercado Pago) são prioritárias. Incompatibilidade impeditiva no Mercado Pago suspende só as etapas dependentes até a decisão do autor.

## Consequências

### Positivas

- Validação isolada antes da virada reduz o risco de inconsistência em produção.
- Migrations separadas do deployment permitem rollback da aplicação sem reverter o schema.
- Sem deploy automático na branch `fase-4` evita viradas acidentais.

### Negativas / trade-offs

- Estratégia `Recreate` causa indisponibilidade temporária durante a virada (aceita no contexto acadêmico: D9.1).
- Virada não é atômica; requer coordenação e aprovação manual em cada etapa destrutiva.
- Branch `fase-4` de longa duração exige gestão de merge cuidadosa com `main`.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Blue/Green deployment | Custo de duplicar recursos; cluster `t3.small` sem capacidade; D6.7 |
| Canary release | Complexidade de roteamento; requer Istio ou outro recurso não disponível; D6.4 |
| Rollback automático do banco | Gera inconsistência com estado distribuído; D9.4 |
| Deploy automático da `fase-4` | Risco de virada acidental; D9.1 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D2.9, D9.1–D9.4, D9.7
- [ADR-008](008-divisao-em-microsservicos.md)
- [E10](../../spec/fase-4/etapas/E10-pipeline-pre-virada-os.md)
