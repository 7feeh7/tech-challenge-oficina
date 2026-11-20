# language: pt
Funcionalidade: Cancelamento com compensação
  Quando o cliente desiste depois do diagnóstico, a oficina desfaz o que já foi
  feito na ordem certa: primeiro a execução, depois o financeiro e por fim o
  estoque. A ordem só é cancelada quando tudo isso está resolvido.

  Cenário: Cliente desiste antes de pagar e a cobrança é cancelada
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço com orçamento aprovado e 2 unidades da peça reservadas
    E a cobrança está disponível para o cliente
    Quando o cliente desiste do atendimento
    Então a ordem entra em cancelamento
    E a execução não é acionada porque não há tarefa aberta
    E o financeiro é solicitado a cancelar a cobrança com o reparo não iniciado
    E a reserva continua mantida até o financeiro concluir
    Quando o financeiro cancela a cobrança
    Então a ordem é cancelada
    E as 2 unidades reservadas voltam ao estoque disponível
    E não restam pendências em aberto

  Cenário: Cliente desiste depois de pagar e antes do início do reparo
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço com orçamento aprovado e 2 unidades da peça reservadas
    E o cliente pagou a cobrança
    Quando o cliente desiste do atendimento
    Então a ordem entra em cancelamento
    E a execução é solicitada a cancelar a tarefa de reparo
    Quando a execução informa que o reparo foi cancelado antes de começar
    Então o financeiro é solicitado a estornar o pagamento com o reparo não iniciado
    E a reserva continua mantida até o financeiro concluir
    Quando o financeiro informa que estornou o pagamento
    Então a ordem é cancelada
    E as 2 unidades reservadas voltam ao estoque disponível
    E a execução foi acionada antes do financeiro
    E a ordem não foi finalizada por exceção

  Cenário: Cliente desiste logo depois de o diagnóstico ser concluído
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço com o diagnóstico concluído e o orçamento ainda não gerado
    Quando o cliente desiste do atendimento
    Então a ordem entra em cancelamento
    E a execução não é acionada porque o diagnóstico já foi concluído
    E o financeiro é solicitado a cancelar o que houver com o reparo não iniciado
    E a situação financeira não é consultada para finalizar a ordem
    Quando o financeiro informa que não havia nada a cancelar
    Então a ordem é cancelada
    E nenhuma peça chegou a ser reservada
