import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
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
import {
  RequireOwnership,
  OwnershipResource,
} from '@/modules/auth/decorators/ownership.decorator';
import { PerfilCliente } from '@/modules/auth/perfil-autorizacao';
import { PerfilUsuario } from '@/modules/usuarios/domain/perfil-usuario';
import { AtualizarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from '@/modules/ordens-servico/application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from '@/modules/ordens-servico/application/use-cases/listar-ordens-servico.use-case';
import { RegistrarDesistenciaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-desistencia.use-case';
import { RegistrarRetiradaUseCase } from '@/modules/ordens-servico/application/use-cases/registrar-retirada.use-case';
import { SolicitarConsultaFinanceiraUseCase } from '@/modules/coordenacao-saga/application/use-cases/solicitar-consulta-financeira.use-case';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { CreateOrdemServicoDto } from '@/modules/ordens-servico/infra/http/dtos/create-ordem-servico.dto';
import { DesistenciaOrdemServicoDto } from '@/modules/ordens-servico/infra/http/dtos/desistencia-ordem-servico.dto';
import { UpdateOrdemServicoDto } from '@/modules/ordens-servico/infra/http/dtos/update-ordem-servico.dto';
import { Idempotent } from '@/shared/idempotency/idempotent.decorator';

@ApiTags('Ordens de Serviço')
@ApiBearerAuth()
@Roles(
  PerfilUsuario.ADMINISTRADOR,
  PerfilUsuario.ATENDENTE,
  PerfilUsuario.MECANICO,
)
@Controller('ordens-servico')
export class OrdensServicoController {
  constructor(
    private readonly criarOrdemServico: CriarOrdemServicoUseCase,
    private readonly listarOrdensServico: ListarOrdensServicoUseCase,
    private readonly buscarOrdemServico: BuscarOrdemServicoUseCase,
    private readonly atualizarOrdemServico: AtualizarOrdemServicoUseCase,
    private readonly registrarDesistencia: RegistrarDesistenciaUseCase,
    private readonly registrarRetirada: RegistrarRetiradaUseCase,
    private readonly calcularTempoMedio: CalcularTempoMedioUseCase,
    private readonly solicitarConsultaFinanceira: SolicitarConsultaFinanceiraUseCase,
  ) {}

  @Post()
  @Idempotent('ordens-servico.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir uma nova ordem de serviço' })
  @ApiResponse({ status: 201, description: 'OS criada com sucesso.' })
  async create(@Body() createOrdemServicoDto: CreateOrdemServicoDto) {
    return await this.criarOrdemServico.execute(createOrdemServicoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar a fila de ordens de serviço' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: StatusOS,
    description: 'Consultar um status específico (inclusive os encerrados)',
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: StatusOS,
  ) {
    return await this.listarOrdensServico.execute(page, limit, status);
  }

  @Get('metricas/tempo-medio')
  @ApiOperation({
    summary: 'Tempo médio de execução e de ciclo total das ordens de serviço',
  })
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    type: String,
    description: 'Início do intervalo (ISO 8601)',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    type: String,
    description: 'Fim do intervalo (ISO 8601)',
  })
  async metricas(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return await this.calcularTempoMedio.execute(
      dataInicio ? new Date(dataInicio) : undefined,
      dataFim ? new Date(dataFim) : undefined,
    );
  }

  @Get(':id')
  @Roles(
    PerfilUsuario.ADMINISTRADOR,
    PerfilUsuario.ATENDENTE,
    PerfilUsuario.MECANICO,
    PerfilCliente,
  )
  @RequireOwnership(OwnershipResource.ORDEM_SERVICO)
  @ApiOperation({ summary: 'Consultar uma ordem de serviço pelo ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarOrdemServico.execute(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar a descrição do problema (PATCH restrito)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrdemServicoDto: UpdateOrdemServicoDto,
  ) {
    return await this.atualizarOrdemServico.execute(id, {
      descricaoProblema: updateOrdemServicoDto.descricaoProblema ?? '',
    });
  }

  @Post(':id/desistencia')
  @Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE)
  @Idempotent('ordens-servico.desistencia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar desistência do cliente' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async desistencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DesistenciaOrdemServicoDto,
  ) {
    return await this.registrarDesistencia.execute(id, body);
  }

  @Post(':id/consulta-financeira')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @Idempotent('ordens-servico.consulta-financeira')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Força nova consulta da situação financeira (prazo de referência ou exceção E10)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 202, description: 'Consulta solicitada ou ignorada.' })
  async consultaFinanceira(@Param('id', ParseUUIDPipe) id: string) {
    return await this.solicitarConsultaFinanceira.execute(id);
  }

  @Post(':id/retirada')
  @Roles(PerfilUsuario.ADMINISTRADOR, PerfilUsuario.ATENDENTE)
  @Idempotent('ordens-servico.retirada')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar retirada do veículo' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async retirada(@Param('id', ParseUUIDPipe) id: string) {
    return await this.registrarRetirada.execute(id);
  }
}
