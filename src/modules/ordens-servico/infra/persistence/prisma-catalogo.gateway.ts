import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/database/prisma.service';
import {
  CatalogoGateway,
  ItemCatalogoDiagnostico,
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

  async servicoExiste(servicoId: string): Promise<boolean> {
    const servico = await this.prisma.servico.findUnique({
      where: { id: servicoId },
      select: { id: true },
    });
    return servico !== null;
  }

  async pecaExiste(pecaId: string): Promise<boolean> {
    const peca = await this.prisma.peca.findUnique({
      where: { id: pecaId },
      select: { id: true },
    });
    return peca !== null;
  }

  async buscarServicoParaDiagnostico(
    servicoId: string,
  ): Promise<ItemCatalogoDiagnostico | null> {
    const servico = await this.prisma.servico.findUnique({
      where: { id: servicoId },
      select: { id: true, nome: true, precoBase: true, ativo: true },
    });
    if (!servico) return null;
    return {
      id: servico.id,
      nome: servico.nome,
      precoUnitario: Number(servico.precoBase),
      ativo: servico.ativo,
    };
  }

  async buscarPecaParaDiagnostico(
    pecaId: string,
  ): Promise<ItemCatalogoDiagnostico | null> {
    const peca = await this.prisma.peca.findUnique({
      where: { id: pecaId },
      select: { id: true, nome: true, precoUnitario: true, ativo: true },
    });
    if (!peca) return null;
    return {
      id: peca.id,
      nome: peca.nome,
      precoUnitario: Number(peca.precoUnitario),
      ativo: peca.ativo,
    };
  }
}
