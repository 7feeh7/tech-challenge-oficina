import {
  Body,
  Controller,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { type RequisicaoAutenticada } from '@/modules/auth/jwt-payload';
import { PerfilUsuario } from '@/modules/usuarios/domain/perfil-usuario';
import { AjustarEstoqueDivergenciaUseCase } from '@/modules/reservas-estoque/application/use-cases/ajustar-estoque-divergencia.use-case';
import { ResolverConsumoManualUseCase } from '@/modules/reservas-estoque/application/use-cases/resolver-consumo-manual.use-case';
import { AjustarEstoqueDivergenciaDto } from '../dtos/ajustar-estoque-divergencia.dto';
import { ResolverConsumoManualDto } from '../dtos/resolver-consumo-manual.dto';
@ApiTags('Reservas de estoque')
@ApiBearerAuth()
@Controller('reservas-estoque')
export class ReservasEstoqueController {
  constructor(
    private readonly ajustarDivergencia: AjustarEstoqueDivergenciaUseCase,
    private readonly resolverConsumoManual: ResolverConsumoManualUseCase,
  ) {}

  @Post('ajustes-divergencia')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Corrigir estoque físico após divergência de inventário (D4.8)',
  })
  @ApiResponse({
    status: 204,
    description:
      'Ajuste da peça registrado. A pendência só é resolvida quando todas as peças divergentes tiverem ajuste.',
  })
  async registrarAjusteDivergencia(
    @Body() body: AjustarEstoqueDivergenciaDto,
    @Req() req: RequisicaoAutenticada,
  ): Promise<void> {
    await this.ajustarDivergencia.execute({
      ...body,
      responsavelId: req.user!.sub,
    });
  }

  @Post('resolucoes-consumo-manual')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Resolver pendência de informação insuficiente com consumo administrativo (E42)',
  })
  @ApiResponse({
    status: 204,
    description: 'Resolução registrada, estoque ajustado e saga retomada.',
  })
  async resolverConsumoManualInicial(
    @Body() body: ResolverConsumoManualDto,
    @Req() req: RequisicaoAutenticada,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<void> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key obrigatória.');
    }
    await this.resolverConsumoManual.execute({
      ...body,
      responsavelId: req.user!.sub,
      idempotencyKey: idempotencyKey.trim(),
    });
  }
}
