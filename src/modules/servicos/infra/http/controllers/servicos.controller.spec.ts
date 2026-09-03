import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarServicoUseCase } from '@/modules/servicos/application/use-cases/atualizar-servico.use-case';
import { BuscarServicoUseCase } from '@/modules/servicos/application/use-cases/buscar-servico.use-case';
import { CriarServicoUseCase } from '@/modules/servicos/application/use-cases/criar-servico.use-case';
import { ListarServicosUseCase } from '@/modules/servicos/application/use-cases/listar-servicos.use-case';
import { RemoverServicoUseCase } from '@/modules/servicos/application/use-cases/remover-servico.use-case';
import {
  NomeServicoJaExisteError,
  ServicoNaoEncontradoError,
} from '@/modules/servicos/domain/errors/servico.errors';
import { ServicosController } from './servicos.controller';

const servicoMock = {
  id: 'uuid-s1',
  nome: 'Troca de óleo',
  descricao: 'Troca de óleo do motor com filtro',
  precoBase: 150,
  tempoEstimadoMin: 60,
  ativo: true,
};

const criarServicoMock = { execute: jest.fn() };
const listarServicosMock = { execute: jest.fn() };
const buscarServicoMock = { execute: jest.fn() };
const atualizarServicoMock = { execute: jest.fn() };
const removerServicoMock = { execute: jest.fn() };

describe('ServicosController', () => {
  let controller: ServicosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicosController],
      providers: [
        { provide: CriarServicoUseCase, useValue: criarServicoMock },
        { provide: ListarServicosUseCase, useValue: listarServicosMock },
        { provide: BuscarServicoUseCase, useValue: buscarServicoMock },
        { provide: AtualizarServicoUseCase, useValue: atualizarServicoMock },
        { provide: RemoverServicoUseCase, useValue: removerServicoMock },
      ],
    }).compile();

    controller = module.get<ServicosController>(ServicosController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'Troca de óleo',
      descricao: 'Troca de óleo do motor com filtro',
      precoBase: 150,
      tempoEstimadoMin: 60,
    };

    it('deve delegar ao caso de uso e retornar os dados', async () => {
      // Arrange
      criarServicoMock.execute.mockResolvedValue(servicoMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarServicoMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(servicoMock);
    });

    it('deve propagar o erro de domínio quando o nome já existe', async () => {
      // Arrange
      criarServicoMock.execute.mockRejectedValue(
        new NomeServicoJaExisteError(),
      );

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        NomeServicoJaExisteError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [servicoMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarServicosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarServicosMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao caso de uso', async () => {
      // Arrange
      listarServicosMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'óleo');

      // Assert
      expect(listarServicosMock.execute).toHaveBeenCalledWith(2, 5, 'óleo');
    });
  });

  describe('findOne', () => {
    it('deve retornar um serviço pelo id', async () => {
      // Arrange
      buscarServicoMock.execute.mockResolvedValue(servicoMock);

      // Act
      const result = await controller.findOne('uuid-s1');

      // Assert
      expect(buscarServicoMock.execute).toHaveBeenCalledWith('uuid-s1');
      expect(result).toMatchObject({ id: 'uuid-s1' });
    });

    it('deve propagar o erro de domínio quando o serviço não existe', async () => {
      // Arrange
      buscarServicoMock.execute.mockRejectedValue(
        new ServicoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        ServicoNaoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o serviço atualizado', async () => {
      // Arrange
      const updated = { ...servicoMock, precoBase: 220.5 };
      atualizarServicoMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-s1', { precoBase: 220.5 });

      // Assert
      expect(atualizarServicoMock.execute).toHaveBeenCalledWith('uuid-s1', {
        precoBase: 220.5,
      });
      expect(result).toMatchObject({ precoBase: 220.5 });
    });

    it('deve propagar o erro de domínio quando o serviço não existe', async () => {
      // Arrange
      atualizarServicoMock.execute.mockRejectedValue(
        new ServicoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-inexistente', { precoBase: 100 }),
      ).rejects.toThrow(ServicoNaoEncontradoError);
    });

    it('deve propagar o erro de domínio quando o nome já está em uso', async () => {
      // Arrange
      atualizarServicoMock.execute.mockRejectedValue(
        new NomeServicoJaExisteError(),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-s1', { nome: 'Alinhamento' }),
      ).rejects.toThrow(NomeServicoJaExisteError);
    });
  });

  describe('remove', () => {
    it('deve remover um serviço e retornar mensagem de sucesso', async () => {
      // Arrange
      removerServicoMock.execute.mockResolvedValue({
        message: 'Serviço "uuid-s1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-s1');

      // Assert
      expect(removerServicoMock.execute).toHaveBeenCalledWith('uuid-s1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-s1'),
      });
    });

    it('deve propagar o erro de domínio quando o serviço não existe', async () => {
      // Arrange
      removerServicoMock.execute.mockRejectedValue(
        new ServicoNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        ServicoNaoEncontradoError,
      );
    });
  });
});
