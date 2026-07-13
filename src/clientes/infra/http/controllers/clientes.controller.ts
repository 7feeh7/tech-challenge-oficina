import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { PerfilUsuario } from '@/usuarios/domain/perfil-usuario';
import { AtualizarClienteUseCase } from '@/clientes/application/use-cases/atualizar-cliente.use-case';
import { BuscarClienteUseCase } from '@/clientes/application/use-cases/buscar-cliente.use-case';
import { CriarClienteUseCase } from '@/clientes/application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from '@/clientes/application/use-cases/listar-clientes.use-case';
import { RemoverClienteUseCase } from '@/clientes/application/use-cases/remover-cliente.use-case';
import { CreateClienteDto } from '@/clientes/infra/http/dtos/create-cliente.dto';
import { UpdateClienteDto } from '@/clientes/infra/http/dtos/update-cliente.dto';

@ApiTags('Clientes')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly criarCliente: CriarClienteUseCase,
    private readonly listarClientes: ListarClientesUseCase,
    private readonly buscarCliente: BuscarClienteUseCase,
    private readonly atualizarCliente: AtualizarClienteUseCase,
    private readonly removerCliente: RemoverClienteUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um novo cliente' })
  @ApiResponse({ status: 201, description: 'Cliente cadastrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'E-mail ou CPF/CNPJ já cadastrado' })
  async create(@Body() createClienteDto: CreateClienteDto) {
    return await this.criarCliente.execute(createClienteDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista clientes cadastrados' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Número da página',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Itens por página',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filtro por nome do cliente',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de clientes retornada com sucesso',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.listarClientes.execute(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um cliente pelo ID' })
  @ApiParam({ name: 'id', description: 'UUID do cliente', type: String })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarCliente.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza os dados de um cliente' })
  @ApiParam({ name: 'id', description: 'UUID do cliente', type: String })
  @ApiResponse({ status: 200, description: 'Cliente atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'E-mail ou CPF/CNPJ já está em uso',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClienteDto: UpdateClienteDto,
  ) {
    return await this.atualizarCliente.execute(id, updateClienteDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove um cliente' })
  @ApiParam({ name: 'id', description: 'UUID do cliente', type: String })
  @ApiResponse({ status: 200, description: 'Cliente removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerCliente.execute(id);
  }
}
