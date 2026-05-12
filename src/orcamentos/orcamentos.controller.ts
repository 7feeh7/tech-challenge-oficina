import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { OrcamentosService } from './orcamentos.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { Roles } from '@/auth/decorators/roles.decorator';
import { PerfilUsuario } from '@/generated/prisma/enums';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Orçamentos')
@ApiBearerAuth()
@Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE)
@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentosService: OrcamentosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar orçamento para uma OS' })
  @ApiResponse({ status: 201, description: 'Orçamento criado com sucesso.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  create(@Body() createOrcamentoDto: CreateOrcamentoDto) {
    return this.orcamentosService.create(createOrcamentoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar orçamentos com paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'ordemServicoId', required: false, description: 'Filtrar por OS' })
  @ApiResponse({ status: 200, description: 'Lista paginada de orçamentos.' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('ordemServicoId') ordemServicoId?: string,
  ) {
    return this.orcamentosService.findAll(page, limit, ordemServicoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar orçamento por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento encontrado.' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orcamentosService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar orçamento (valor, status, aprovação/rejeição)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento atualizado.' })
  @ApiResponse({ status: 400, description: 'Motivo de rejeição obrigatório.' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrcamentoDto: UpdateOrcamentoDto,
  ) {
    return this.orcamentosService.update(id, updateOrcamentoDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover orçamento' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Orçamento removido.' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orcamentosService.remove(id);
  }
}
