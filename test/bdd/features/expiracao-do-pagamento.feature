# language: pt
Funcionalidade: Expiração do pagamento
  O prazo vencido sozinho não prova que o cliente deixou de pagar: a oficina
  só cancela a ordem e devolve as peças depois que o financeiro confirma que
  não houve pagamento.

  Cenário: Pagamento não chega no prazo e a ordem é cancelada com as peças devolvidas
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço com orçamento aprovado e 2 unidades da peça reservadas
    E a cobrança está disponível para o cliente
    Quando o prazo de referência da reserva vence sem aviso de pagamento
    Então o financeiro é consultado sobre o pagamento
    E a ordem continua aguardando o pagamento com a reserva mantida
    E o reparo não é iniciado
    Quando o financeiro responde que não houve pagamento
    Então a ordem entra em cancelamento
    E o financeiro é solicitado a cancelar a cobrança
    E a reserva continua mantida até o financeiro concluir
    Quando o financeiro confirma o cancelamento da cobrança
    Então a ordem é cancelada
    E as 2 unidades reservadas voltam ao estoque disponível
    E o reparo nunca foi iniciado
