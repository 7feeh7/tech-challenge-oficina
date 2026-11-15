# ADR-008 — Divisão em microsserviços

**Status:** aceito  
**Data:** 2026-11-15  
**Substitui:** [ADR-006](006-separacao-quatro-repositorios.md)

## Contexto

A Fase 4 exige no mínimo três microsserviços independentes (R4-01 a R4-04), cada um com repositório, infraestrutura e banco próprios. O monólito `tech-challenge` concentra cadastros, catálogo, estoque, OS, orçamentos, cobranças, diagnóstico e reparo — domínios com ritmos de mudança, tecnologias de persistência e requisitos de escalabilidade distintos. A Fase 3 já separou repositórios por finalidade (ADR-006); a Fase 4 separa por domínio de negócio.

## Decisão

Três microsserviços coordenados por uma saga orquestrada (D1.1):

| Serviço | Repositório | Domínio |
| --- | --- | --- |
| OS Service | `tech-challenge` (P4) | Cadastros, catálogo, estoque, OS, status global, orquestração da saga |
| Billing Service | `tech-challenge-billing` (D8.7) | Orçamentos, aprovação, cobrança, Mercado Pago, estorno, pendência manual |
| Execution Service | `tech-challenge-execution` (D8.7) | Tarefas de diagnóstico e reparo, fila de execução |

Lambdas existentes (`auth-cpf`, `notificacao`) ficam na borda e não participam da saga (D0.4, D1.1).

**Fluxo principal** (D1.10 — sem atalhos):

```
Abertura → Diagnóstico (Execution) → Orçamento (Billing) → Aprovação
→ Reserva de estoque (OS) → Cobrança e pagamento (Billing)
→ Reparo (Execution) → Encerramento (OS)
```

**Regras de propriedade** (D1.6, D1.12):

- O OS é o único dono do catálogo, estoque, itens oficiais, preços e status global da OS.
- O Execution é o único dono de tarefas, fila e peças utilizadas.
- O Billing é o único dono de orçamentos, aprovações, cobranças, pagamentos, estornos e pendências manuais.
- Nenhum serviço acessa diretamente o banco de outro (D0.4, R4-17).

**Status globais da OS** (D1.16, D2.4, D2.5):

`RECEBIDA` → `EM_DIAGNOSTICO` → `AGUARDANDO_APROVACAO` → `AGUARDANDO_PAGAMENTO` → `AGUARDANDO_EXECUCAO` → `EM_EXECUCAO` → `FINALIZADA` → `ENTREGUE`

Cancelamento/desistência leva a `EM_CANCELAMENTO` → `CANCELADA` (E3). Exceção E10: `EM_CANCELAMENTO` → `FINALIZADA` quando o reparo foi concluído antes da desistência e as condições de D4.7 estão todas satisfeitas.

**Rodadas** (D1.7): diagnóstico e orçamento são versionados por rodada. Rejeição do orçamento abre nova rodada; item mantido conserva o preço congelado; item novo recebe o preço vigente.

**Estoque** (D1.4, D1.8, D1.14): distingue disponível, reservado e consumido. Reserva após aprovação; consumo pelas peças efetivamente utilizadas no reparo. Cancelamento libera só peças não utilizadas.

**Exceções declaradas** (D2.8): E1–E10 registradas no `decisoes.md` e declaradas no README.

## Consequências

### Positivas

- Domínios independentes: escalabilidade, pipeline e banco próprios por serviço (R4-01 a R4-04).
- Equipes podem evoluir cada serviço sem coordenação de deploy.
- Responsabilidades claras evitam acesso cross-database (R4-17).
- O OS Service reaproveita o repositório e o banco `oficina` (P4, D0.2).

### Negativas / trade-offs

- Saga distribuída aumenta a complexidade operacional (ver ADR-009).
- Consistência eventual entre serviços; projeções locais podem estar desatualizadas (D3.8).
- Dois requests síncronos críticos: conclusão do diagnóstico e reserva de estoque (D1.6, D1.11).
- Instância RDS compartilhada entre OS e Billing: domínio de falha comum, isolamento lógico (D5.6, P3).

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
| --- | --- |
| Monólito evoluído | Não atende R4-01 a R4-04 |
| Mais de três microsserviços (p. ex. serviço de catálogo separado) | Overengineering; D0.3; D1.1 proíbe serviços adicionais nesta fase |
| Coreografia pura | Escolhida a orquestração; ver ADR-009 |
| Repositório monorepo | Não atende R4-02, R4-30 |

## Referências

- [`decisoes.md`](../../spec/fase-4/decisoes.md): D1.1–D1.21, D0.2–D0.4, P3, P4, E1–E10
- [01-architecture.md](../../spec/fase-4/01-architecture.md)
- [03-service-boundaries.md](../../spec/fase-4/03-service-boundaries.md)
