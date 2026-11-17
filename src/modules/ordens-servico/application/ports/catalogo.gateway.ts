export interface VeiculoDoCatalogo {
  id: string;
  clienteId: string;
}

/**
 * Porta própria do módulo de OS para consultar os outros agregados. Só expõe o
 * que a abertura precisa saber: se cliente, veículo e itens sugeridos existem.
 * Preços não são consultados aqui: o preço congela só na conclusão do
 * diagnóstico (D2.22, exceção E9).
 */
export interface CatalogoGateway {
  clienteExiste(clienteId: string): Promise<boolean>;
  buscarVeiculo(veiculoId: string): Promise<VeiculoDoCatalogo | null>;
  servicoExiste(servicoId: string): Promise<boolean>;
  pecaExiste(pecaId: string): Promise<boolean>;
}
