import { SetMetadata } from '@nestjs/common';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';

export const CHAMADOR_INTERNO_KEY = 'chamadorInterno';

export const ChamadorInterno = (relacao: RelacaoChamadorInterno) =>
  SetMetadata(CHAMADOR_INTERNO_KEY, relacao);
