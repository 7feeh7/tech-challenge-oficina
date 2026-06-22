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
import { OrdensServicoService } from './ordens-servico.service';
import { CreateOrdemServicoDto } from './dto/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from './dto/update-ordem-servico.dto';
import { Roles } from '@/auth/decorators/roles.decorator';
import { PerfilUsuario } from '@/generated/prisma/enums';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Ordens de Serviço')
@ApiBearerAuth()
@Roles(
  PerfilUsuario.ADMINISTRADOR,
  PerfilUsuario.ATENDENTE,
  PerfilUsuario.MECANICO,
)
@Controller('ordens-servico')
export class OrdensServicoController {
  constructor(private readonly ordensServicoService: OrdensServicoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar nova ordem de serviço' })
  @ApiResponse({ status: 201, description: 'OS criada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Veículo não pertence ao cliente.' })
  @ApiResponse({
    status: 404,
    description: 'Cliente ou veículo não encontrado.',
  })
  create(@Body() createOrdemServicoDto: CreateOrdemServicoDto) {
    return this.ordensServicoService.create(createOrdemServicoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ordens de serviço com paginação' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por status da OS',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de ordens de serviço.',
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.ordensServicoService.findAll(page, limit, status);
  }

  @Get('metricas/tempo-medio')
  @ApiOperation({
    summary: 'Tempo médio de execução das ordens de serviço',
    description:
      'Calcula o tempo médio entre iniciadaEm/finalizadaEm e o ciclo total (criadoEm/entregueEm). Aceita filtros opcionais de período (baseados em criadoEm).',
  })
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    type: String,
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    type: String,
    example: '2026-12-31',
  })
  @ApiResponse({ status: 200, description: 'Métricas calculadas.' })
  tempoMedio(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.ordensServicoService.tempoMedioExecucao(
      dataInicio ? new Date(dataInicio) : undefined,
      dataFim ? new Date(dataFim) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ordem de serviço por ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS encontrada.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordensServicoService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar ordem de serviço (status, diagnóstico etc.)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS atualizada com sucesso.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrdemServicoDto: UpdateOrdemServicoDto,
  ) {
    return this.ordensServicoService.update(id, updateOrdemServicoDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover ordem de serviço' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS removida com sucesso.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordensServicoService.remove(id);
  }
}
