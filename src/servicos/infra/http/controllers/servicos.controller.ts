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
import { AtualizarServicoUseCase } from '@/servicos/application/use-cases/atualizar-servico.use-case';
import { BuscarServicoUseCase } from '@/servicos/application/use-cases/buscar-servico.use-case';
import { CriarServicoUseCase } from '@/servicos/application/use-cases/criar-servico.use-case';
import { ListarServicosUseCase } from '@/servicos/application/use-cases/listar-servicos.use-case';
import { RemoverServicoUseCase } from '@/servicos/application/use-cases/remover-servico.use-case';
import { CreateServicoDto } from '@/servicos/infra/http/dtos/create-servico.dto';
import { UpdateServicoDto } from '@/servicos/infra/http/dtos/update-servico.dto';

@ApiTags('Serviços')
@ApiBearerAuth()
@Controller('servicos')
export class ServicosController {
  constructor(
    private readonly criarServico: CriarServicoUseCase,
    private readonly listarServicos: ListarServicosUseCase,
    private readonly buscarServico: BuscarServicoUseCase,
    private readonly atualizarServico: AtualizarServicoUseCase,
    private readonly removerServico: RemoverServicoUseCase,
  ) {}

  @Post()
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um novo serviço' })
  @ApiResponse({ status: 201, description: 'Serviço cadastrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Nome de serviço já cadastrado' })
  async create(@Body() createServicoDto: CreateServicoDto) {
    return await this.criarServico.execute(createServicoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista serviços cadastrados' })
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
    description: 'Filtro por nome do serviço',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de serviços retornada com sucesso',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.listarServicos.execute(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um serviço pelo ID' })
  @ApiParam({ name: 'id', description: 'UUID do serviço', type: String })
  @ApiResponse({ status: 200, description: 'Serviço encontrado' })
  @ApiResponse({ status: 404, description: 'Serviço não encontrado' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarServico.execute(id);
  }

  @Patch(':id')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @ApiOperation({ summary: 'Atualiza os dados de um serviço' })
  @ApiParam({ name: 'id', description: 'UUID do serviço', type: String })
  @ApiResponse({ status: 200, description: 'Serviço atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Serviço não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Nome já está em uso por outro serviço',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateServicoDto: UpdateServicoDto,
  ) {
    return await this.atualizarServico.execute(id, updateServicoDto);
  }

  @Delete(':id')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove um serviço' })
  @ApiParam({ name: 'id', description: 'UUID do serviço', type: String })
  @ApiResponse({ status: 200, description: 'Serviço removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Serviço não encontrado' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerServico.execute(id);
  }
}
