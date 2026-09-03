import { Veiculo, VeiculoProps } from '../../domain/entities/veiculo.entity';
import { ClienteConsultaGateway } from '../ports/cliente-consulta.gateway';
import { VeiculoGateway } from '../ports/veiculo.gateway';

/** Dublês compartilhados pelos specs dos casos de uso. */

export const criarVeiculoFake = (overrides: Partial<VeiculoProps> = {}) =>
  new Veiculo({
    id: 'uuid-v1',
    placa: 'ABC1D23',
    marca: 'Toyota',
    modelo: 'Corolla',
    ano: 2023,
    clienteId: 'uuid-c1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  });

export const criarGatewayMock = (): jest.Mocked<VeiculoGateway> => ({
  buscarPorId: jest.fn(),
  buscarComClientePorId: jest.fn(),
  existeComPlaca: jest.fn(),
  placaPertenceAOutroVeiculo: jest.fn(),
  listar: jest.fn(),
  criar: jest.fn(),
  atualizar: jest.fn(),
  remover: jest.fn(),
});

export const criarClientesMock = (): jest.Mocked<ClienteConsultaGateway> => ({
  existe: jest.fn().mockResolvedValue(true),
});
