import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { AjustarEstoqueDivergenciaDto } from '../dtos/ajustar-estoque-divergencia.dto';

@ApiTags('Reservas de estoque')
@ApiBearerAuth()
@Controller('reservas-estoque')
export class ReservasEstoqueController {
  constructor(
    private readonly ajustarDivergencia: AjustarEstoqueDivergenciaUseCase,
  ) {}

  @Post('ajustes-divergencia')
  @Roles(PerfilUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Corrigir estoque físico após divergência de inventário (D4.8)',
  })
  @ApiResponse({
    status: 204,
    description: 'Ajuste registrado e pendência resolvida.',
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
}
