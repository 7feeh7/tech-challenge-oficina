import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class ClientesService {
  constructor(private prismaService: PrismaService) {}

  async create(createClienteDto: CreateClienteDto) {
    const clienteJaExiste = await this.prismaService.cliente.findFirst({
      where: {
        OR: [
          { email: createClienteDto.email },
          { cpfCnpj: createClienteDto.cpfCnpj },
        ],
      },
    });

    if (clienteJaExiste) {
      throw new ConflictException(
        'Já existe um cliente com esse e-mail ou CPF/CNPJ.',
      );
    }

    const cliente = await this.prismaService.cliente.create({
      data: createClienteDto,
    });

    const { id, nome, email, telefone } = cliente;

    return {
      id,
      nome,
      email,
      telefone,
    };
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? { nome: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [clientes, total] = await Promise.all([
      this.prismaService.cliente.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: limit,
      }),
      this.prismaService.cliente.count({ where }),
    ]);

    return {
      data: clientes.map(this.mapCliente),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const cliente = await this.prismaService.cliente.findUnique({
      where: { id },
      include: { veiculos: true },
    });

    if (!cliente) {
      throw new NotFoundException(`Cliente com id "${id}" não encontrado.`);
    }

    return cliente;
  }

  async update(id: string, updateClienteDto: UpdateClienteDto) {
    await this.findOne(id);

    if (updateClienteDto.email || updateClienteDto.cpfCnpj) {
      const conflito = await this.prismaService.cliente.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                ...(updateClienteDto.email
                  ? [{ email: updateClienteDto.email }]
                  : []),
                ...(updateClienteDto.cpfCnpj
                  ? [{ cpfCnpj: updateClienteDto.cpfCnpj }]
                  : []),
              ],
            },
          ],
        },
      });

      if (conflito) {
        throw new ConflictException(
          'E-mail ou CPF/CNPJ já está em uso por outro cliente.',
        );
      }
    }

    const cliente = await this.prismaService.cliente.update({
      where: { id },
      data: updateClienteDto,
    });

    return this.mapCliente(cliente);
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.cliente.delete({ where: { id } });

    return { message: `Cliente "${id}" removido com sucesso.` };
  }

  private mapCliente(cliente: {
    id: string;
    nome: string;
    cpfCnpj: string;
    email: string;
    telefone: string;
  }) {
    return {
      id: cliente.id,
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj,
      email: cliente.email,
      telefone: cliente.telefone,
    };
  }
}
