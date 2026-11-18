# language: pt
Funcionalidade: Recusa do orçamento
  Quando o cliente recusa o orçamento, a oficina refaz o diagnóstico numa nova
  rodada partindo dos itens da rodada anterior, sem cobrar nem reservar nada
  da rodada recusada.

  Cenário: Cliente recusa o orçamento e o diagnóstico é refeito
    Dado uma peça com 10 unidades em estoque
    E uma ordem de serviço com o orçamento gerado para 1 serviço e 2 unidades da peça
    Quando o cliente recusa o orçamento
    Então a ordem volta ao diagnóstico em uma nova rodada
    E a execução recebe o pedido de diagnóstico da nova rodada com os itens da rodada anterior
    E a rodada recusada não deixa reserva nem cobrança
    Quando o mecânico inicia o novo diagnóstico
    E o preço da peça sobe no catálogo
    E o mecânico conclui o novo diagnóstico com 3 unidades da peça e uma segunda peça nova
    Então o preço combinado da peça na rodada anterior é mantido
    E a peça nova entra com o preço atual do catálogo
    E o orçamento da nova rodada é independente do orçamento recusado
    Quando o cliente aprova o novo orçamento
    Então só a nova rodada reserva peças
    E a recusa reenviada não abre outra rodada
