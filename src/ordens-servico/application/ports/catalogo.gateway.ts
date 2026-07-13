export interface VeiculoDoCatalogo {
  id: string;
  clienteId: string;
}

/**
 * Porta própria do módulo de OS para consultar os outros agregados. Só expõe o
 * que a ordem precisa saber: se cliente/veículo existem e qual o preço vigente
 * de serviços e peças (que a OS congela como snapshot).
 */
export interface CatalogoGateway {
  clienteExiste(clienteId: string): Promise<boolean>;
  buscarVeiculo(veiculoId: string): Promise<VeiculoDoCatalogo | null>;
  buscarPrecoDoServico(servicoId: string): Promise<number | null>;
  buscarPrecoDaPeca(pecaId: string): Promise<number | null>;
}
