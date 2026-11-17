import { applyDecorators } from '@nestjs/common';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { ChamadorInterno } from './chamador-interno.decorator';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';
import { RotaInterna } from './rota-interna.decorator';

/** Marca rota interna GET: pública para JWT de usuário, protegida por token do chamador. */
export const RotaInternaGet = (relacao: RelacaoChamadorInterno) =>
  applyDecorators(Public(), ChamadorInterno(relacao), RotaInterna());
