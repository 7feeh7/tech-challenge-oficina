import type { PrismaService } from '@/shared/database/prisma.service';

export async function estoqueDaPeca(prisma: PrismaService, pecaId: string) {
  const peca = await prisma.peca.findUniqueOrThrow({
    where: { id: pecaId },
    select: { quantidadeEstoque: true, quantidadeReservada: true },
  });
  return {
    fisico: peca.quantidadeEstoque,
    reservado: peca.quantidadeReservada,
  };
}

export async function reservasDaOrdem(
  prisma: PrismaService,
  ordemServicoId: string,
  pecaId: string,
) {
  return await prisma.reservaEstoque.findMany({
    where: { ordemServicoId, pecaId },
    orderBy: { rodada: 'asc' },
  });
}
