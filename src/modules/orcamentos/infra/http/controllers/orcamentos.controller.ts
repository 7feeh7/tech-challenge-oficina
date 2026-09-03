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
import { AtualizarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/atualizar-orcamento.use-case';
import { BuscarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/buscar-orcamento.use-case';
import { CriarOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/criar-orcamento.use-case';
import { ListarOrcamentosUseCase } from '@/modules/orcamentos/application/use-cases/listar-orcamentos.use-case';
import { RemoverOrcamentoUseCase } from '@/modules/orcamentos/application/use-cases/remover-orcamento.use-case';
import { CreateOrcamentoDto } from '@/modules/orcamentos/infra/http/dtos/create-orcamento.dto';
import { UpdateOrcamentoDto } from '@/modules/orcamentos/infra/http/dtos/update-orcamento.dto';

@ApiTags('Orçamentos')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE)
@Controller('orcamentos')
export class OrcamentosController {
  constructor(
    private readonly criarOrcamento: CriarOrcamentoUseCase,
    private readonly listarOrcamentos: ListarOrcamentosUseCase,
    private readonly buscarOrcamento: BuscarOrcamentoUseCase,
    private readonly atualizarOrcamento: AtualizarOrcamentoUseCase,
    private readonly removerOrcamento: RemoverOrcamentoUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gerar orçamento (move a OS para AGUARDANDO_APROVACAO)',
  })
  @ApiResponse({ status: 201, description: 'Orçamento criado.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  async create(@Body() createOrcamentoDto: CreateOrcamentoDto) {
    return await this.criarOrcamento.execute(createOrcamentoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar orçamentos' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'ordemServicoId',
    required: false,
    description: 'Filtrar por OS',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de orçamentos.' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('ordemServicoId') ordemServicoId?: string,
  ) {
    return await this.listarOrcamentos.execute(page, limit, ordemServicoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar um orçamento pelo ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento encontrado.' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarOrcamento.execute(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Aprovar ou recusar o orçamento (aprovar move a OS para EM_EXECUCAO e baixa o estoque)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento atualizado.' })
  @ApiResponse({
    status: 400,
    description: 'Motivo de rejeição ausente ou estoque insuficiente.',
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrcamentoDto: UpdateOrcamentoDto,
  ) {
    return await this.atualizarOrcamento.execute(id, updateOrcamentoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover um orçamento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento removido.' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerOrcamento.execute(id);
  }
}
