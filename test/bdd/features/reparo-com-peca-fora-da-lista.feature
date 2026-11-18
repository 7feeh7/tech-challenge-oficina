# language: pt
Funcionalidade: Reparo com peça usada além do autorizado
  O estoque só baixa o que foi reservado para a ordem. O que o mecânico usou
  a mais, ou fora da lista, vira pendência de inventário: a ordem só é
  finalizada depois que o administrador resolve.

  Cenário: Mecânico usa mais peças do que o autorizado e uma peça fora da lista
    Dado uma peça com 10 unidades em estoque e outra peça com 5 unidades
    E uma outra ordem de serviço com 3 unidades da primeira peça reservadas
    E uma ordem de serviço paga com 2 unidades da primeira peça reservadas e o reparo iniciado
    Quando o mecânico conclui o reparo com 3 unidades da primeira peça e 1 da outra peça fora da lista
    Então só as 2 unidades reservadas saem do estoque da primeira peça
    E a reserva da outra ordem e o estoque livre da outra peça não são consumidos
    E uma pendência de inventário registra as duas divergências com a justificativa do mecânico
    E a ordem continua em execução e não pode ser finalizada
    Quando o administrador autenticado ajusta o estoque físico da primeira peça
    Então a pendência é resolvida com o administrador como responsável
    E a ordem é finalizada com a conclusão original do reparo
    E o consumo não foi aplicado duas vezes
    E a reserva original mantém a quantidade autorizada
