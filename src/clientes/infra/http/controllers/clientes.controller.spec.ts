import { Test, TestingModule } from '@nestjs/testing';
import { AtualizarClienteUseCase } from '@/clientes/application/use-cases/atualizar-cliente.use-case';
import { BuscarClienteUseCase } from '@/clientes/application/use-cases/buscar-cliente.use-case';
import { CriarClienteUseCase } from '@/clientes/application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from '@/clientes/application/use-cases/listar-clientes.use-case';
import { RemoverClienteUseCase } from '@/clientes/application/use-cases/remover-cliente.use-case';
import {
  ClienteJaExisteError,
  ClienteNaoEncontradoError,
} from '@/clientes/domain/errors/cliente.errors';
import { ClientesController } from './clientes.controller';

const clienteMock = {
  id: 'uuid-1',
  nome: 'João Silva',
  cpfCnpj: '52998224725',
  email: 'joao@email.com',
  telefone: '11999999999',
};

const criarClienteMock = { execute: jest.fn() };
const listarClientesMock = { execute: jest.fn() };
const buscarClienteMock = { execute: jest.fn() };
const atualizarClienteMock = { execute: jest.fn() };
const removerClienteMock = { execute: jest.fn() };

describe('ClientesController', () => {
  let controller: ClientesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [
        { provide: CriarClienteUseCase, useValue: criarClienteMock },
        { provide: ListarClientesUseCase, useValue: listarClientesMock },
        { provide: BuscarClienteUseCase, useValue: buscarClienteMock },
        { provide: AtualizarClienteUseCase, useValue: atualizarClienteMock },
        { provide: RemoverClienteUseCase, useValue: removerClienteMock },
      ],
    }).compile();

    controller = module.get<ClientesController>(ClientesController);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'João Silva',
      cpfCnpj: '52998224725',
      email: 'joao@email.com',
      telefone: '11999999999',
    };

    it('deve delegar ao caso de uso e retornar os dados', async () => {
      // Arrange
      criarClienteMock.execute.mockResolvedValue(clienteMock);

      // Act
      const result = await controller.create(dto);

      // Assert
      expect(criarClienteMock.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual(clienteMock);
    });

    it('deve propagar o erro de domínio quando o cliente já existe', async () => {
      // Arrange
      criarClienteMock.execute.mockRejectedValue(new ClienteJaExisteError());

      // Act & Assert
      await expect(controller.create(dto)).rejects.toThrow(
        ClienteJaExisteError,
      );
    });
  });

  describe('findAll', () => {
    const paginatedResponse = {
      data: [clienteMock],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    it('deve retornar lista paginada com valores padrão', async () => {
      // Arrange
      listarClientesMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      const result = await controller.findAll(1, 10, undefined);

      // Assert
      expect(listarClientesMock.execute).toHaveBeenCalledWith(1, 10, undefined);
      expect(result).toEqual(paginatedResponse);
    });

    it('deve repassar parâmetros de busca e paginação ao caso de uso', async () => {
      // Arrange
      listarClientesMock.execute.mockResolvedValue(paginatedResponse);

      // Act
      await controller.findAll(2, 5, 'João');

      // Assert
      expect(listarClientesMock.execute).toHaveBeenCalledWith(2, 5, 'João');
    });
  });

  describe('findOne', () => {
    it('deve retornar um cliente pelo id', async () => {
      // Arrange
      buscarClienteMock.execute.mockResolvedValue({
        ...clienteMock,
        veiculos: [],
      });

      // Act
      const result = await controller.findOne('uuid-1');

      // Assert
      expect(buscarClienteMock.execute).toHaveBeenCalledWith('uuid-1');
      expect(result).toMatchObject({ id: 'uuid-1', veiculos: [] });
    });

    it('deve propagar o erro de domínio quando o cliente não existe', async () => {
      // Arrange
      buscarClienteMock.execute.mockRejectedValue(
        new ClienteNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        ClienteNaoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar e retornar o cliente atualizado', async () => {
      // Arrange
      const updated = { ...clienteMock, nome: 'João Atualizado' };
      atualizarClienteMock.execute.mockResolvedValue(updated);

      // Act
      const result = await controller.update('uuid-1', {
        nome: 'João Atualizado',
      });

      // Assert
      expect(atualizarClienteMock.execute).toHaveBeenCalledWith('uuid-1', {
        nome: 'João Atualizado',
      });
      expect(result).toMatchObject({ nome: 'João Atualizado' });
    });

    it('deve propagar o erro de domínio quando o cliente não existe', async () => {
      // Arrange
      atualizarClienteMock.execute.mockRejectedValue(
        new ClienteNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-inexistente', { nome: 'Teste' }),
      ).rejects.toThrow(ClienteNaoEncontradoError);
    });

    it('deve propagar o erro de domínio quando o e-mail já está em uso', async () => {
      // Arrange
      atualizarClienteMock.execute.mockRejectedValue(
        new ClienteJaExisteError(),
      );

      // Act & Assert
      await expect(
        controller.update('uuid-1', { email: 'outro@email.com' }),
      ).rejects.toThrow(ClienteJaExisteError);
    });
  });

  describe('remove', () => {
    it('deve remover um cliente e retornar mensagem de sucesso', async () => {
      // Arrange
      removerClienteMock.execute.mockResolvedValue({
        message: 'Cliente "uuid-1" removido com sucesso.',
      });

      // Act
      const result = await controller.remove('uuid-1');

      // Assert
      expect(removerClienteMock.execute).toHaveBeenCalledWith('uuid-1');
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-1'),
      });
    });

    it('deve propagar o erro de domínio quando o cliente não existe', async () => {
      // Arrange
      removerClienteMock.execute.mockRejectedValue(
        new ClienteNaoEncontradoError('uuid-inexistente'),
      );

      // Act & Assert
      await expect(controller.remove('uuid-inexistente')).rejects.toThrow(
        ClienteNaoEncontradoError,
      );
    });
  });
});
