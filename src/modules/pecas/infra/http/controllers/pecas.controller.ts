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
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { PerfilUsuario } from '@/modules/usuarios/domain/perfil-usuario';
import { AtualizarPecaUseCase } from '@/modules/pecas/application/use-cases/atualizar-peca.use-case';
import { BuscarPecaUseCase } from '@/modules/pecas/application/use-cases/buscar-peca.use-case';
import { CriarPecaUseCase } from '@/modules/pecas/application/use-cases/criar-peca.use-case';
import { ListarPecasUseCase } from '@/modules/pecas/application/use-cases/listar-pecas.use-case';
import { RemoverPecaUseCase } from '@/modules/pecas/application/use-cases/remover-peca.use-case';
import { CreatePecaDto } from '@/modules/pecas/infra/http/dtos/create-peca.dto';
import { UpdatePecaDto } from '@/modules/pecas/infra/http/dtos/update-peca.dto';

@ApiTags('Peças')
@ApiBearerAuth()
@Controller('pecas')
export class PecasController {
  constructor(
    private readonly criarPeca: CriarPecaUseCase,
    private readonly listarPecas: ListarPecasUseCase,
    private readonly buscarPeca: BuscarPecaUseCase,
    private readonly atualizarPeca: AtualizarPecaUseCase,
    private readonly removerPeca: RemoverPecaUseCase,
  ) {}

  @Post()
  @Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ALMOXARIFE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra uma nova peça' })
  @ApiResponse({ status: 201, description: 'Peça cadastrada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Código de peça já cadastrado' })
  async create(@Body() createPecaDto: CreatePecaDto) {
    return await this.criarPeca.execute(createPecaDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista peças cadastradas' })
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
    description: 'Filtro por nome ou código da peça',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de peças retornada com sucesso',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return await this.listarPecas.execute(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma peça pelo ID' })
  @ApiParam({ name: 'id', description: 'UUID da peça', type: String })
  @ApiResponse({ status: 200, description: 'Peça encontrada' })
  @ApiResponse({ status: 404, description: 'Peça não encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarPeca.execute(id);
  }

  @Patch(':id')
  @Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ALMOXARIFE)
  @ApiOperation({ summary: 'Atualiza os dados de uma peça' })
  @ApiParam({ name: 'id', description: 'UUID da peça', type: String })
  @ApiResponse({ status: 200, description: 'Peça atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Peça não encontrada' })
  @ApiResponse({
    status: 409,
    description: 'Código já está em uso por outra peça',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePecaDto: UpdatePecaDto,
  ) {
    return await this.atualizarPeca.execute(id, updatePecaDto);
  }

  @Delete(':id')
  @Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ALMOXARIFE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove uma peça' })
  @ApiParam({ name: 'id', description: 'UUID da peça', type: String })
  @ApiResponse({ status: 200, description: 'Peça removida com sucesso' })
  @ApiResponse({ status: 404, description: 'Peça não encontrada' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerPeca.execute(id);
  }
}
