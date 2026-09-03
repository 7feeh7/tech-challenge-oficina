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
import { AtualizarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/atualizar-ordem-servico.use-case';
import { BuscarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/buscar-ordem-servico.use-case';
import { CalcularTempoMedioUseCase } from '@/modules/ordens-servico/application/use-cases/calcular-tempo-medio.use-case';
import { CriarOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/criar-ordem-servico.use-case';
import { ListarOrdensServicoUseCase } from '@/modules/ordens-servico/application/use-cases/listar-ordens-servico.use-case';
import { RemoverOrdemServicoUseCase } from '@/modules/ordens-servico/application/use-cases/remover-ordem-servico.use-case';
import { StatusOS } from '@/modules/ordens-servico/domain/status-os';
import { CreateOrdemServicoDto } from '@/modules/ordens-servico/infra/http/dtos/create-ordem-servico.dto';
import { UpdateOrdemServicoDto } from '@/modules/ordens-servico/infra/http/dtos/update-ordem-servico.dto';

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
    private readonly removerOrdemServico: RemoverOrdemServicoUseCase,
    private readonly calcularTempoMedio: CalcularTempoMedioUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir uma nova ordem de serviço' })
  @ApiResponse({ status: 201, description: 'OS criada com sucesso.' })
  @ApiResponse({
    status: 400,
    description: 'Veículo não pertence ao cliente informado.',
  })
  @ApiResponse({
    status: 404,
    description: 'Cliente, veículo, serviço ou peça não encontrado.',
  })
  async create(@Body() createOrdemServicoDto: CreateOrdemServicoDto) {
    return await this.criarOrdemServico.execute(createOrdemServicoDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar a fila de ordens de serviço',
    description:
      'Sem filtro, retorna apenas as OS em aberto (exclusão lógica das FINALIZADA e ENTREGUE), ' +
      'ordenadas por Em Execução > Aguardando Aprovação > Diagnóstico > Recebida e, dentro de cada ' +
      'status, as mais antigas primeiro. Informar `status` consulta um status específico, inclusive os encerrados.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: StatusOS,
    description: 'Consultar um status específico (inclusive os encerrados)',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de OS.' })
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
  @ApiResponse({ status: 200, description: 'Métricas calculadas.' })
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
  @ApiOperation({ summary: 'Consultar uma ordem de serviço pelo ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS encontrada.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.buscarOrdemServico.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar status, dados ou itens da OS' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS atualizada.' })
  @ApiResponse({ status: 400, description: 'Transição de status inválida.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrdemServicoDto: UpdateOrdemServicoDto,
  ) {
    return await this.atualizarOrdemServico.execute(id, updateOrdemServicoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover uma ordem de serviço' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'OS removida.' })
  @ApiResponse({ status: 404, description: 'OS não encontrada.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.removerOrdemServico.execute(id);
  }
}
