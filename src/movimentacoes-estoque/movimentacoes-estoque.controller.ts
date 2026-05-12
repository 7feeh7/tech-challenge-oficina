import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MovimentacoesEstoqueService } from './movimentacoes-estoque.service';
import { CreateMovimentacaoEstoqueDto } from './dto/create-movimentacao-estoque.dto';
import { Roles } from '@/auth/decorators/roles.decorator';
import { PerfilUsuario } from '@/generated/prisma/enums';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Movimentações de Estoque')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ALMOXARIFE)
@Controller('movimentacoes-estoque')
export class MovimentacoesEstoqueController {
  constructor(private readonly movimentacoesEstoqueService: MovimentacoesEstoqueService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar entrada ou baixa de peça no estoque' })
  @ApiResponse({ status: 201, description: 'Movimentação registrada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Estoque insuficiente para baixa.' })
  @ApiResponse({ status: 404, description: 'Peça não encontrada.' })
  create(@Body() createMovimentacaoEstoqueDto: CreateMovimentacaoEstoqueDto) {
    return this.movimentacoesEstoqueService.create(createMovimentacaoEstoqueDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar movimentações de estoque' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'pecaId', required: false, description: 'Filtrar por peça', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Lista paginada de movimentações.' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('pecaId') pecaId?: string,
  ) {
    return this.movimentacoesEstoqueService.findAll(page, limit, pecaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar movimentação de estoque por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Movimentação encontrada.' })
  @ApiResponse({ status: 404, description: 'Movimentação não encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.movimentacoesEstoqueService.findOne(id);
  }
}
