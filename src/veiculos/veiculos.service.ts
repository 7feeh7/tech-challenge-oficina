import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVeiculoDto } from './dto/create-veiculo.dto';
import { UpdateVeiculoDto } from './dto/update-veiculo.dto';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class VeiculosService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createVeiculoDto: CreateVeiculoDto) {
    const clienteExiste = await this.prismaService.cliente.findUnique({
      where: { id: createVeiculoDto.clienteId },
    });

    if (!clienteExiste) {
      throw new NotFoundException(
        `Cliente com id "${createVeiculoDto.clienteId}" não encontrado.`,
      );
    }

    const placaJaExiste = await this.prismaService.veiculo.findUnique({
      where: { placa: createVeiculoDto.placa },
    });

    if (placaJaExiste) {
      throw new ConflictException('Já existe um veículo com essa placa.');
    }

    const veiculo = await this.prismaService.veiculo.create({
      data: createVeiculoDto,
    });

    return this.mapVeiculo(veiculo);
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { placa: { contains: search, mode: 'insensitive' as const } },
            { modelo: { contains: search, mode: 'insensitive' as const } },
            { marca: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [veiculos, total] = await Promise.all([
      this.prismaService.veiculo.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
        include: { cliente: { select: { id: true, nome: true } } },
      }),
      this.prismaService.veiculo.count({ where }),
    ]);

    return {
      data: veiculos.map(this.mapVeiculo),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const veiculo = await this.prismaService.veiculo.findUnique({
      where: { id },
      include: { cliente: { select: { id: true, nome: true } } },
    });

    if (!veiculo) {
      throw new NotFoundException(`Veículo com id "${id}" não encontrado.`);
    }

    return veiculo;
  }

  async update(id: string, updateVeiculoDto: UpdateVeiculoDto) {
    await this.findOne(id);

    if (updateVeiculoDto.placa) {
      const conflito = await this.prismaService.veiculo.findFirst({
        where: {
          AND: [{ id: { not: id } }, { placa: updateVeiculoDto.placa }],
        },
      });

      if (conflito) {
        throw new ConflictException('Placa já está em uso por outro veículo.');
      }
    }

    if (updateVeiculoDto.clienteId) {
      const clienteExiste = await this.prismaService.cliente.findUnique({
        where: { id: updateVeiculoDto.clienteId },
      });

      if (!clienteExiste) {
        throw new NotFoundException(
          `Cliente com id "${updateVeiculoDto.clienteId}" não encontrado.`,
        );
      }
    }

    const veiculo = await this.prismaService.veiculo.update({
      where: { id },
      data: updateVeiculoDto,
    });

    return this.mapVeiculo(veiculo);
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.veiculo.delete({ where: { id } });

    return { message: `Veículo "${id}" removido com sucesso.` };
  }

  private mapVeiculo(veiculo: {
    id: string;
    placa: string;
    marca: string;
    modelo: string;
    ano: number;
    clienteId: string;
  }) {
    return {
      id: veiculo.id,
      placa: veiculo.placa,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      ano: veiculo.ano,
      clienteId: veiculo.clienteId,
    };
  }
}
