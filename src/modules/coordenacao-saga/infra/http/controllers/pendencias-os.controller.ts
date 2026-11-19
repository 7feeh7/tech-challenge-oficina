import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { type RequisicaoAutenticada } from '@/modules/auth/jwt-payload';
import { PerfilUsuario } from '@/modules/usuarios/domain/perfil-usuario';
import { ResolverPendenciaManualUseCase } from '../../../application/use-cases/resolver-pendencia-manual.use-case';
import { ResolverPendenciaManualDto } from '../dtos/resolver-pendencia-manual.dto';

@ApiTags('Pendências da OS')
@ApiBearerAuth()
@Controller('ordens-servico')
export class PendenciasOsController {
  constructor(
    private readonly resolverPendenciaManual: ResolverPendenciaManualUseCase,
  ) {}

  @Post(':id/pendencias/:pendenciaId/resolucao-manual')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Resolver manualmente uma pendência elegível da OS',
    description:
      'Só três casos são elegíveis: financeira de segundo pagamento com evidência de estorno integral do Billing; ' +
      'financeira de pagamento tardio com tratamento ESTORNO_AUTOMATICO; e inventário de divergência de consumo com ' +
      'todas as peças divergentes fora do catálogo. Qualquer outra pendência responde 409 PENDENCIA_NAO_ELEGIVEL. ' +
      'O OS nunca inicia estorno nem envia comando ao Billing.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Mesma chave e mesmo corpo repetem a resposta sem novo efeito; mesma chave com corpo diferente responde 409 CONTEUDO_DIVERGENTE.',
  })
  @ApiResponse({ status: 204, description: 'Pendência resolvida.' })
  @ApiResponse({
    status: 400,
    description: 'Idempotency-Key ausente, motivo inválido ou id malformado.',
  })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.' })
  @ApiResponse({ status: 403, description: 'Perfil sem acesso.' })
  @ApiResponse({
    status: 404,
    description: 'OS ou pendência inexistente, ou pendência de outra OS.',
  })
  @ApiResponse({
    status: 409,
    description:
      'PENDENCIA_NAO_ELEGIVEL (inclui pendência já resolvida), EVIDENCIA_BILLING_AUSENTE ou CONTEUDO_DIVERGENTE.',
  })
  async resolver(
    @Param('id', ParseUUIDPipe) ordemServicoId: string,
    @Param('pendenciaId', ParseUUIDPipe) pendenciaId: string,
    @Body() body: ResolverPendenciaManualDto,
    @Req() req: RequisicaoAutenticada,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<void> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key obrigatória.');
    }
    await this.resolverPendenciaManual.execute({
      ordemServicoId,
      pendenciaId,
      motivo: body.motivo,
      responsavelId: req.user!.sub,
      idempotencyKey: idempotencyKey.trim(),
    });
  }
}
