import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { RelacaoChamadorInterno } from '../../../relacao-chamador-interno';
import { RotaInternaPost } from '../../../decorators/rota-interna-post.decorator';
import { ConcluirDiagnosticoInternoUseCase } from '../../../application/use-cases/concluir-diagnostico-interno.use-case';
import { ReservarOsInternoUseCase } from '../../../application/use-cases/reservar-os-interno.use-case';
import { ConcluirDiagnosticoInternoDto } from '../dtos/concluir-diagnostico-interno.dto';
import { ReservarOsInternoDto } from '../dtos/reservar-os-interno.dto';

@Controller('internal/ordens-servico')
export class RotasInternasOrdensController {
  constructor(
    private readonly concluirDiagnostico: ConcluirDiagnosticoInternoUseCase,
    private readonly reservarOs: ReservarOsInternoUseCase,
  ) {}

  @Post(':id/diagnostico')
  @HttpCode(HttpStatus.OK)
  @RotaInternaPost(RelacaoChamadorInterno.EXECUTION)
  async concluirDiagnosticoRota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConcluirDiagnosticoInternoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return await this.concluirDiagnostico.execute({
      ordemServicoId: id,
      rodada: body.rodada,
      tarefaId: body.tarefaId,
      laudo: body.laudo,
      itens: body.itens,
      idempotencyKey: idempotencyKey?.trim() ?? '',
    });
  }

  @Post(':id/reservas')
  @HttpCode(HttpStatus.OK)
  @RotaInternaPost(RelacaoChamadorInterno.BILLING)
  async reservar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReservarOsInternoDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return await this.reservarOs.execute({
      ordemServicoId: id,
      rodada: body.rodada,
      orcamentoId: body.orcamentoId,
      idempotencyKey: idempotencyKey?.trim() ?? '',
    });
  }
}
