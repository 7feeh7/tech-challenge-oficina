import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from '@/modules/ordens-servico/application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from '@/modules/ordens-servico/application/use-cases/listar-ordens-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { RegistrarRetiradaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-retirada.use-case';
import { OrdemServicoNaoEncontradaError } from '@/modules/ordens-servico/domain/errors/ordem-servico.errors';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { OrdensServicoController } from './ordens-servico.controller';

const ordemMock = {
  id: 'uuid-os1',
  numero: 1,
  status: StatusOS.RECEBIDA,
  cliente: { id: 'uuid-c1', nome: 'João Silva' },
  veiculo: { id: 'uuid-v1', placa: 'ABC1D23', modelo: 'Corolla' },
};

const criarOrdemMock = { execute: jest.fn() };
const listarOrdensMock = { execute: jest.fn() };
const buscarOrdemMock = { execute: jest.fn() };
const atualizarOrdemMock = { execute: jest.fn() };
const desistenciaMock = { execute: jest.fn() };
const retiradaMock = { execute: jest.fn() };
const calcularTempoMedioMock = { execute: jest.fn() };

describe('OrdensServicoController', () => {
  let controller: OrdensServicoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdensServicoController],
      providers: [
        { provide: CriarOrdemServicoUseCase, useValue: criarOrdemMock },
        { provide: ListarOrdensServicoUseCase, useValue: listarOrdensMock },
        { provide: BuscarOrdemServicoUseCase, useValue: buscarOrdemMock },
        { provide: AtualizarOrdemServicoUseCase, useValue: atualizarOrdemMock },
        { provide: RegistrarDesistenciaUseCase, useValue: desistenciaMock },
        { provide: RegistrarRetiradaUseCase, useValue: retiradaMock },
        {
          provide: CalcularTempoMedioUseCase,
          useValue: calcularTempoMedioMock,
        },
      ],
    }).compile();

    controller = module.get<OrdensServicoController>(OrdensServicoController);
    jest.clearAllMocks();
  });

  it('delega criação ao caso de uso', async () => {
    criarOrdemMock.execute.mockResolvedValue(ordemMock);

    const dto = { clienteId: 'uuid-c1', veiculoId: 'uuid-v1' };
    const result = await controller.create(dto);

    expect(criarOrdemMock.execute).toHaveBeenCalledWith(dto);
    expect(result).toEqual(ordemMock);
  });

  it('delega PATCH de descrição', async () => {
    atualizarOrdemMock.execute.mockResolvedValue(ordemMock);

    await controller.update('uuid-os1', {
      descricaoProblema: 'Barulho',
    });

    expect(atualizarOrdemMock.execute).toHaveBeenCalledWith('uuid-os1', {
      descricaoProblema: 'Barulho',
    });
  });

  it('delega desistência', async () => {
    desistenciaMock.execute.mockResolvedValue(ordemMock);

    await controller.desistencia('uuid-os1', { motivo: 'Cliente desistiu' });

    expect(desistenciaMock.execute).toHaveBeenCalledWith('uuid-os1', {
      motivo: 'Cliente desistiu',
    });
  });

  it('propaga erro quando a OS não existe na consulta', async () => {
    buscarOrdemMock.execute.mockRejectedValue(
      new OrdemServicoNaoEncontradaError('uuid-inexistente'),
    );

    await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
      OrdemServicoNaoEncontradaError,
    );
  });
});
