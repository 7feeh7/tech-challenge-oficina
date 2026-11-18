# language: pt
Funcionalidade: Atendimento completo da ordem de serviço
  A oficina conduz a ordem do atendimento até a entrega do veículo,
  sem reparar antes de receber e sem gastar peça além do necessário.

  Cenário: Cliente aprova o orçamento, paga e retira o veículo reparado
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço aberta para trocar 2 unidades dessa peça
    Quando o mecânico inicia e conclui o diagnóstico com 1 serviço e 2 unidades da peça
    Então a ordem aguarda a aprovação do orçamento
    E o orçamento tem o valor dos itens do diagnóstico
    Quando o preço da peça sobe no catálogo
    Então a ordem mantém o preço combinado no diagnóstico
    Quando o cliente aprova o orçamento
    Então 2 unidades da peça ficam reservadas sem sair do estoque físico
    E a ordem aguarda o pagamento
    Quando a cobrança fica disponível para o cliente
    Então o cliente recebe o link de pagamento
    E o reparo ainda não foi pedido à execução
    Quando o cliente paga
    Então a ordem aguarda a execução
    E o reparo é pedido à execução uma única vez
    Quando o mecânico inicia e conclui o reparo usando 2 unidades da peça
    Então a ordem é finalizada
    E 2 unidades saem do estoque físico e a reserva é consumida
    Quando o aviso de reparo concluído chega de novo
    Então o estoque e a ordem permanecem como estavam
    Quando o cliente retira o veículo
    Então a ordem é entregue
    E todos os pedidos às outras áreas referem-se a esta ordem e à primeira rodada
    E o atendimento seguiu a ordem esperada
