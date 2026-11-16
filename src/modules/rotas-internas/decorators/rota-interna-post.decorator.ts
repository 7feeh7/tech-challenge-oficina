import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { ChamadorInterno } from './chamador-interno.decorator';
import { RelacaoChamadorInterno } from '../relacao-chamador-interno';

export const ROTA_INTERNA_POST_KEY = 'rotaInternaPost';

/** Marca rota interna POST: pública para JWT de usuário, protegida por token do chamador. */
export const RotaInternaPost = (relacao: RelacaoChamadorInterno) =>
  applyDecorators(
    Public(),
    ChamadorInterno(relacao),
    SetMetadata(ROTA_INTERNA_POST_KEY, true),
  );
