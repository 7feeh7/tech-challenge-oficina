import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { BuscarMovimentacaoUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/buscar-movimentacao.use-case';
import { ListarMovimentacoesUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/listar-movimentacoes.use-case';
import { RegistrarMovimentacaoUseCase } from '@/modules/movimentacoes-estoque/application/use-cases/registrar-movimentacao.use-case';
import { CreateMovimentacaoEstoqueDto } from '@/modules/movimentacoes-estoque/infra/http/dtos/create-movimentacao-estoque.dto';
import { Idempotent } from '@/shared/idempotency/idempotent.decorator';

@ApiTags('Movimentações de Estoque')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ALMOXARIFE)
@Controller('movimentacoes-estoque')
export class MovimentacoesEstoqueController {
  constructor(
    private readonly registrarMovimentacao: RegistrarMovimentacaoUseCase,
    private readonly listarMovimentacoes: ListarMovimentacoesUseCase,
    private readonly buscarMovimentacao: BuscarMovimentacaoUseCase,
  ) {}

  @Post()
  @Idempotent('movimentacoes-estoque.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar entrada ou baixa de peça no estoque' })
  @ApiResponse({
    status: 201,
    description: 'Movimentação registrada com sucesso.',
  })
  @ApiResponse({ status: 400, description: 'Estoque insuficiente para baixa.' })
  @ApiResponse({ status: 404, description: 'Peça não encontrada.' })
  async create(
    @Body() createMovimentacaoEstoqueDto: CreateMovimentacaoEstoqueDto,
  ) {
    return await this.registrarMovimentacao.execute(
      createMovimentacaoEstoqueDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar movimentações de estoque' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'pecaId',
    required: false,
    description: 'Filtrar por peça',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de movimentações.' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('pecaId') pecaId?: string,
  ) {
    return await this.listarMovimentacoes.execute(page, limit, pecaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar movimentação de estoque por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Movimentação encontrada.' })
  @ApiResponse({ status: 404, description: 'Movimentação não encontrada.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarMovimentacao.execute(id);
  }
}
