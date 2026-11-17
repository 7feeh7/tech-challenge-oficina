import { SetMetadata } from '@nestjs/common';

/** Marca rota sob `/internal` que exige token de chamador (fail-closed sem metadado). */
export const ROTA_INTERNA_KEY = 'rotaInterna';

export const RotaInterna = () => SetMetadata(ROTA_INTERNA_KEY, true);
