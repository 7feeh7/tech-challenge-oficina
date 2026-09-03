import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  CatalogoGateway,
  VeiculoDoCatalogo,
} from '../../application/ports/catalogo.gateway';

@Injectable()
export class PrismaCatalogoGateway implements CatalogoGateway {
  constructor(private readonly prisma: PrismaService) {}

  async clienteExiste(clienteId: string): Promise<boolean> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });
    return cliente !== null;
  }

  async buscarVeiculo(veiculoId: string): Promise<VeiculoDoCatalogo | null> {
    return await this.prisma.veiculo.findUnique({
      where: { id: veiculoId },
      select: { id: true, clienteId: true },
    });
  }

  async buscarPrecoDoServico(servicoId: string): Promise<number | null> {
    const servico = await this.prisma.servico.findUnique({
      where: { id: servicoId },
      select: { precoBase: true },
    });
    return servico ? Number(servico.precoBase) : null;
  }

  async buscarPrecoDaPeca(pecaId: string): Promise<number | null> {
    const peca = await this.prisma.peca.findUnique({
      where: { id: pecaId },
      select: { precoUnitario: true },
    });
    return peca ? Number(peca.precoUnitario) : null;
  }
}
