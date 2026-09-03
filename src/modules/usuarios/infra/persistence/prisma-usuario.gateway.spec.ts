import { PrismaService } from '@/shared/database/prisma.service';
import { PerfilUsuario } from '@/shared/generated/prisma/enums';
import { Usuario } from '../../domain/entities/usuario.entity';
import { PerfilUsuario as PerfilDominio } from '../../domain/perfil-usuario';
import { PrismaUsuarioGateway } from './prisma-usuario.gateway';

const prisma = {
  usuario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as PrismaService;

const db = prisma.usuario as unknown as Record<string, jest.Mock>;

const raw = {
  id: 'u1',
  nome: 'Maria Souza',
  email: 'maria@oficina.com',
  senhaHash: 'hash',
  perfil: PerfilUsuario.ATENDENTE,
  ativo: true,
  criadoEm: new Date('2026-01-01'),
  atualizadoEm: new Date('2026-01-01'),
};

const usuario = new Usuario({ ...raw, perfil: PerfilDominio.ATENDENTE });

describe('PrismaUsuarioGateway', () => {
  const gateway = new PrismaUsuarioGateway(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('buscarPorId devolve a entidade quando encontra', async () => {
    db.findUnique.mockResolvedValue(raw);

    const encontrado = await gateway.buscarPorId('u1');

    expect(encontrado).toBeInstanceOf(Usuario);
    expect(encontrado?.email).toBe('maria@oficina.com');
  });

  it('buscarPorId devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorId('x')).resolves.toBeNull();
  });

  it('buscarPorEmail normaliza o e-mail antes de consultar', async () => {
    db.findUnique.mockResolvedValue(raw);

    await gateway.buscarPorEmail('  MARIA@OFICINA.COM  ');

    expect(db.findUnique).toHaveBeenCalledWith({
      where: { email: 'maria@oficina.com' },
    });
  });

  it('buscarPorEmail devolve null quando não encontra', async () => {
    db.findUnique.mockResolvedValue(null);

    await expect(gateway.buscarPorEmail('ninguem@x.com')).resolves.toBeNull();
  });

  it('emailPertenceAOutroUsuario normaliza o e-mail e exclui o próprio id', async () => {
    db.findFirst.mockResolvedValue({ id: 'u2' });

    await expect(
      gateway.emailPertenceAOutroUsuario(' MARIA@OFICINA.COM ', 'u1'),
    ).resolves.toBe(true);

    expect(db.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [{ id: { not: 'u1' } }, { email: 'maria@oficina.com' }],
      },
    });
  });

  it('emailPertenceAOutroUsuario é falso quando o e-mail está livre', async () => {
    db.findFirst.mockResolvedValue(null);

    await expect(
      gateway.emailPertenceAOutroUsuario('novo@oficina.com', 'u1'),
    ).resolves.toBe(false);
  });

  it('listar sem busca não filtra', async () => {
    db.findMany.mockResolvedValue([raw]);
    db.count.mockResolvedValue(1);

    const pagina = await gateway.listar(1, 10);

    expect(pagina.total).toBe(1);
    expect(pagina.usuarios[0]).toBeInstanceOf(Usuario);
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0 }),
    );
  });

  it('listar com busca filtra por nome', async () => {
    db.findMany.mockResolvedValue([]);
    db.count.mockResolvedValue(0);

    await gateway.listar(2, 10, 'maria');

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nome: { contains: 'maria', mode: 'insensitive' } },
        skip: 10,
      }),
    );
  });

  it('criar persiste os campos do domínio', async () => {
    db.create.mockResolvedValue(raw);

    const criado = await gateway.criar(usuario);

    expect(criado).toBeInstanceOf(Usuario);
    expect(db.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nome: 'Maria Souza',
        email: 'maria@oficina.com',
        senhaHash: 'hash',
      }),
    });
  });

  it('atualizar grava pelo id', async () => {
    db.update.mockResolvedValue(raw);

    await expect(gateway.atualizar('u1', usuario)).resolves.toBeInstanceOf(
      Usuario,
    );
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
  });

  it('remover apaga pelo id', async () => {
    db.delete.mockResolvedValue(raw);

    await gateway.remover('u1');

    expect(db.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});
