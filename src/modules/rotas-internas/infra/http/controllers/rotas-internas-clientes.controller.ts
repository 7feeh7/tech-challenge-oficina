import { Controller, Get, Query } from '@nestjs/common';
import { RelacaoChamadorInterno } from '../../../relacao-chamador-interno';
import { RotaInternaGet } from '../../../decorators/rota-interna-get.decorator';
import { BuscarClienteCpfInternoUseCase } from '../../../application/use-cases/buscar-cliente-cpf-interno.use-case';

@Controller('internal/clientes')
export class RotasInternasClientesController {
  constructor(private readonly buscarPorCpf: BuscarClienteCpfInternoUseCase) {}

  @Get()
  @RotaInternaGet(RelacaoChamadorInterno.AUTH_CPF)
  async consultar(@Query('cpf') cpf: string) {
    return await this.buscarPorCpf.execute(cpf ?? '');
  }
}
