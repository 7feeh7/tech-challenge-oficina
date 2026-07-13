import { Veiculo } from '../../domain/entities/veiculo.entity';
import {
  ClienteDoVeiculoNaoEncontradoError,
  PlacaVeiculoJaExisteError,
  VeiculoNaoEncontradoError,
} from '../../domain/errors/veiculo.errors';
import {
  VeiculoOutput,
  VeiculoOutputMapper,
} from '../mappers/veiculo-output.mapper';
import { ClienteConsultaGateway } from '../ports/cliente-consulta.gateway';
import { VeiculoGateway } from '../ports/veiculo.gateway';

export interface AtualizarVeiculoInput {
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  clienteId?: string;
}

export class AtualizarVeiculoUseCase {
  constructor(
    private readonly veiculos: VeiculoGateway,
    private readonly clientes: ClienteConsultaGateway,
  ) {}

  async execute(
    id: string,
    input: AtualizarVeiculoInput,
  ): Promise<VeiculoOutput> {
    const veiculo = await this.veiculos.buscarPorId(id);
    if (!veiculo) {
      throw new VeiculoNaoEncontradoError(id);
    }

    await this.garantirPlacaDisponivel(id, veiculo, input.placa);
    await this.garantirClienteExistente(veiculo, input.clienteId);

    if (input.placa !== undefined) veiculo.alterarPlaca(input.placa);
    if (input.marca !== undefined) veiculo.alterarMarca(input.marca);
    if (input.modelo !== undefined) veiculo.alterarModelo(input.modelo);
    if (input.ano !== undefined) veiculo.alterarAno(input.ano);
    if (input.clienteId !== undefined) {
      veiculo.transferirParaCliente(input.clienteId);
    }

    return VeiculoOutputMapper.toOutput(
      await this.veiculos.atualizar(id, veiculo),
    );
  }

  private async garantirPlacaDisponivel(
    id: string,
    veiculo: Veiculo,
    placa?: string,
  ): Promise<void> {
    if (placa === undefined) return;

    const novaPlaca = Veiculo.normalizarPlaca(placa);
    if (novaPlaca === veiculo.placa) return;

    if (await this.veiculos.placaPertenceAOutroVeiculo(id, novaPlaca)) {
      throw new PlacaVeiculoJaExisteError(
        'Placa já está em uso por outro veículo.',
      );
    }
  }

  private async garantirClienteExistente(
    veiculo: Veiculo,
    clienteId?: string,
  ): Promise<void> {
    if (clienteId === undefined || clienteId === veiculo.clienteId) return;

    if (!(await this.clientes.existe(clienteId))) {
      throw new ClienteDoVeiculoNaoEncontradoError(clienteId);
    }
  }
}
