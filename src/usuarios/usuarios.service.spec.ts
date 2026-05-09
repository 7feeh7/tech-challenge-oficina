import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '@/database/prisma.service';
import { PerfilUsuario } from '@/generated/prisma/enums';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hash-fake'),
}));

const usuarioMock = {
  id: 'uuid-u1',
  nome: 'Maria Souza',
  email: 'maria@oficina.com',
  senhaHash: 'hash-fake',
  perfil: PerfilUsuario.ATENDENTE,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

const prismaMock = {
  usuario: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UsuariosService', () => {
  let service: UsuariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      nome: 'Maria Souza',
      email: 'maria@oficina.com',
      senha: 'senhaSegura123',
      perfil: PerfilUsuario.ATENDENTE,
    };

    it('deve criar um usuário com sucesso e retornar sem a senha', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioMock);

      // Act
      const result = await service.create(dto);

      // Assert
      expect(prismaMock.usuario.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ senhaHash: 'hash-fake' }),
      });
      expect(result).not.toHaveProperty('senhaHash');
      expect(result).toMatchObject({
        id: 'uuid-u1',
        email: 'maria@oficina.com',
      });
    });

    it('deve lançar ConflictException se e-mail já existir', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);

      // Act & Assert
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de usuários sem senhaHash', async () => {
      // Arrange
      prismaMock.usuario.findMany.mockResolvedValue([usuarioMock]);
      prismaMock.usuario.count.mockResolvedValue(1);

      // Act
      const result = await service.findAll(1, 10);

      // Assert
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.data[0]).not.toHaveProperty('senhaHash');
      expect(result.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('deve calcular skip corretamente para page 2', async () => {
      // Arrange
      prismaMock.usuario.findMany.mockResolvedValue([]);
      prismaMock.usuario.count.mockResolvedValue(15);

      // Act
      const result = await service.findAll(2, 10);

      // Assert
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.meta).toMatchObject({ total: 15, totalPages: 2 });
    });
  });

  describe('findOne', () => {
    it('deve retornar um usuário pelo id sem senhaHash', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);

      // Act
      const result = await service.findOne('uuid-u1');

      // Assert
      expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-u1' },
      });
      expect(result).not.toHaveProperty('senhaHash');
      expect(result).toMatchObject({ id: 'uuid-u1' });
    });

    it('deve lançar NotFoundException se não encontrar', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar nome sem verificar conflito de e-mail', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioMock,
        nome: 'Maria Atualizada',
      });

      // Act
      const result = await service.update('uuid-u1', {
        nome: 'Maria Atualizada',
      });

      // Assert
      expect(result).toMatchObject({ nome: 'Maria Atualizada' });
      expect(result).not.toHaveProperty('senhaHash');
    });

    it('deve atualizar a senha realizando novo hash', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.update.mockResolvedValue(usuarioMock);

      // Act
      await service.update('uuid-u1', { senha: 'novaSenha456' });

      // Assert
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senhaHash: 'hash-fake' }),
        }),
      );
    });

    it('deve lançar NotFoundException se usuário não existir', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('uuid-inexistente', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ConflictException se e-mail já estiver em uso', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue({ id: 'outro-uuid' });

      // Act & Assert
      await expect(
        service.update('uuid-u1', { email: 'outro@oficina.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deve remover um usuário com sucesso', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.delete.mockResolvedValue(usuarioMock);

      // Act
      const result = await service.remove('uuid-u1');

      // Assert
      expect(prismaMock.usuario.delete).toHaveBeenCalledWith({
        where: { id: 'uuid-u1' },
      });
      expect(result).toMatchObject({
        message: expect.stringContaining('uuid-u1'),
      });
    });

    it('deve lançar NotFoundException se usuário não existir', async () => {
      // Arrange
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
